import { NextRequest, NextResponse } from "next/server";
import {
  getSessionById,
  getStudents,
  getAttendanceForSession,
  addAttendance,
  appendAuditLog,
} from "@/lib/sheets";
import { lookupSession, lookupByOTP } from "@/lib/session-store";
import { calculateDistance } from "@/lib/haversine";
import { AttendanceRecord } from "@/types";

// GPS heuristic thresholds — advisory only (see step 8b below). Both are weak,
// false-positive-prone signals; they flag a record for teacher review, they never
// block a check-in or change its status.
const GPS_ACCURACY_SUSPICIOUS_M = 100; // fix too imprecise to trust against a small geofence
const GPS_TOO_PRECISE_M = 5;           // suspiciously exact + perfectly static readings

// ── Simple in-process rate limiter ────────────────────────────────────────────
// Campus WiFi NATs an entire classroom behind one public IP, so a strict per-IP
// cap would 429 a real class checking in together. Limit tightly per IP+student
// (blocks brute force / spam from one device) with a loose per-IP backstop.
// Replace with Redis/KV for multi-instance deployments.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_STUDENT = 10;  // same IP + same student_id, real submissions only
const RATE_LIMIT_MAX_PER_IP = 300;      // backstop across a shared campus IP
// Separate, looser budget for name-preview lookups (see step 5b below) — these
// share the same debounced input as a student correcting typos while typing,
// so counting them against RATE_LIMIT_MAX_PER_STUDENT could lock a real student
// out of their own check-in before they ever submit it.
const PREVIEW_RATE_LIMIT_MAX_PER_IP = 30;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function bumpCounter(key: string, max: number): boolean {
  const now = Date.now();
  const hit = ipHits.get(key);
  if (!hit || now - hit.windowStart >= RATE_LIMIT_WINDOW_MS) {
    ipHits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (hit.count >= max) return false;
  hit.count++;
  return true;
}

function checkRateLimit(ip: string, studentId?: string): boolean {
  if (!bumpCounter(ip, RATE_LIMIT_MAX_PER_IP)) return false;
  if (studentId && !bumpCounter(`${ip}|${studentId}`, RATE_LIMIT_MAX_PER_STUDENT)) return false;
  return true;
}

function checkPreviewRateLimit(ip: string): boolean {
  return bumpCounter(`preview|${ip}`, PREVIEW_RATE_LIMIT_MAX_PER_IP);
}

// Periodically purge stale entries to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, hit] of ipHits) {
    if (now - hit.windowStart >= RATE_LIMIT_WINDOW_MS) ipHits.delete(ip);
  }
}, 5 * 60_000);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  try {
    const body = await req.json();
    const {
      otp,
      student_id,
      lat,
      lng,
      spreadsheet_id: bodySpreadsheetId,
      device_fingerprint,
      device_fingerprint_gpu,
      accuracy,
      location_jitter_m,
      location_samples,
    } = body;
    let session_id: string = body.session_id ?? "";

    const rateLimitOk = body.preview
      ? checkPreviewRateLimit(ip)
      : checkRateLimit(ip, typeof student_id === "string" ? student_id : undefined);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many requests — please wait before retrying" },
        { status: 429 }
      );
    }

    // Resolve spreadsheet + access token.
    // QR mode:     session_id present  → look up by session_id
    // Manual mode: session_id absent   → look up by OTP (OTP index built while session is polled)
    let spreadsheetId: string = bodySpreadsheetId ?? "";
    let accessToken: string | undefined;

    if (session_id) {
      const stored = await lookupSession(session_id);
      spreadsheetId = bodySpreadsheetId ?? stored?.spreadsheetId ?? "";
      accessToken = stored?.accessToken;
    } else if (otp) {
      const byOtp = await lookupByOTP(otp);
      if (byOtp) {
        session_id = byOtp.sessionId;
        spreadsheetId = byOtp.spreadsheetId;
        accessToken = byOtp.accessToken;
      }
    }

    if (!spreadsheetId || !accessToken) {
      return NextResponse.json(
        { error: "session_invalid", message: "Session not available" },
        { status: 404 }
      );
    }

    // 1. Find session
    const sessionData = await getSessionById(accessToken, spreadsheetId, session_id);
    if (!sessionData) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    // 2. Check OTP
    if (otp && sessionData.otp !== otp) {
      return NextResponse.json({ error: "invalid_otp" }, { status: 400 });
    }

    // 3. Check closed
    if (sessionData.closed_at) {
      return NextResponse.json({ error: "session_expired" }, { status: 400 });
    }

    // 4. Check expiry
    const openedAt = new Date(sessionData.opened_at).getTime();
    const now = Date.now();
    const expiresAt = openedAt + sessionData.otp_expire_min * 60 * 1000;
    if (now > expiresAt) {
      return NextResponse.json({ error: "session_expired" }, { status: 400 });
    }

    // Pre-check only (no student_id) — QR mode validates the link on page load
    if (!student_id) {
      return NextResponse.json({ valid: true, session: sessionData });
    }

    // Server-side validate student_id format (9 digits, no injection)
    if (typeof student_id !== "string" || !/^\d{9}$/.test(student_id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // 5. Find student
    const students = await getStudents(
      accessToken,
      spreadsheetId,
      sessionData.course_id,
      sessionData.section
    );
    const student = students.find((s) => s.student_id === student_id);
    if (!student) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // 5b. Preview mode — resolve the name so the student can confirm it's really
    // them *before* submitting (one mistyped digit can check in a classmate).
    // Passes the same session/OTP gates above but writes nothing.
    if (body.preview) {
      return NextResponse.json({
        valid: true,
        preview: true,
        student: { firstname: student.firstname, lastname: student.lastname },
      });
    }

    // 6. Duplicate check
    const existing = await getAttendanceForSession(accessToken, spreadsheetId, session_id);
    const dup = existing.find((a) => a.student_id === student_id);
    if (dup) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        status: "already_checked",
        original_status: dup.status,
        checked_at: dup.checked_at,
        student: { firstname: student.firstname, lastname: student.lastname },
        distance_m: dup.distance_m,
        gps_pass: dup.gps_pass,
      });
    }

    // 7. Calculate GPS distance
    let gps_pass = false;
    let distance_m = 0;
    if (lat != null && lng != null) {
      distance_m = Math.round(
        calculateDistance(lat, lng, sessionData.lat, sessionData.lng)
      );
      gps_pass = distance_m <= sessionData.radius_m;
    }

    // 8. Determine status
    const lateThreshold = openedAt + sessionData.late_after_min * 60 * 1000;
    let status: AttendanceRecord["status"];
    if (!gps_pass) {
      status = "gps_fail";
    } else if (sessionData.late_enabled !== false && now > lateThreshold) {
      status = "late";
    } else {
      status = "present";
    }

    // 9. Write attendance
    const checkedAt = new Date().toISOString();
    const record: AttendanceRecord = {
      attendance_id: crypto.randomUUID(),
      session_id,
      course_id: sessionData.course_id,
      student_id,
      firstname: student.firstname,
      lastname: student.lastname,
      status,
      gps_pass,
      distance_m,
      checked_at: checkedAt,
      overridden: false,
      overridden_at: "",
      device_fingerprint: device_fingerprint ?? "",
      device_fingerprint_gpu: device_fingerprint_gpu ?? "",
      ip_address: ip !== "unknown" ? ip : "",
      lat: lat ?? undefined,
      lng: lng ?? undefined,
    };

    // 9a. GPS anomaly heuristic — advisory only, doesn't touch status/gps_pass
    const flagNotes: string[] = [];
    if (typeof accuracy === "number" && accuracy > GPS_ACCURACY_SUSPICIOUS_M) {
      flagNotes.push(`Auto-flagged: GPS accuracy ต่ำผิดปกติ (±${Math.round(accuracy)}m)`);
    } else if (
      typeof accuracy === "number" && accuracy <= GPS_TOO_PRECISE_M &&
      typeof location_jitter_m === "number" && (location_samples ?? 0) >= 2 && location_jitter_m === 0
    ) {
      flagNotes.push("Auto-flagged: ตำแหน่งนิ่งผิดปกติร่วมกับความแม่นยำสูงเกินจริง (สงสัยตำแหน่งปลอม)");
    }

    // 9b. Device-conflict detection is intentionally NOT auto-flagged here.
    // Fingerprint matches (shared lab PCs, a borrowed phone) are common and not
    // reliably distinguishable from cheating at check-in time — silently
    // retro-editing an earlier, already-accepted student's record is unfair to
    // them. Device conflicts are instead surfaced non-destructively for teacher
    // review via the "confirmed conflicts" tier in the session view, computed
    // fresh from device_fingerprint/device_fingerprint_gpu matches across all
    // attendance rows (see lib/conflict-detection.ts) — no write needed here.

    if (flagNotes.length > 0) {
      record.flagged = true;
      record.flagged_at = checkedAt;
      record.action_taken = "auto_flag";
      record.edit_note = flagNotes.join(" / ");
    }

    await addAttendance(accessToken, spreadsheetId, record);

    if (flagNotes.length > 0) {
      await appendAuditLog(accessToken, spreadsheetId, {
        action: "update", entity_type: "attendance", entity_id: record.attendance_id,
        changed_from: { flagged: false }, changed_to: { flagged: true },
        note: flagNotes.join(" / "),
      });
    }

    return NextResponse.json({
      success: true,
      status,
      student: { firstname: student.firstname, lastname: student.lastname },
      checked_at: checkedAt,
      distance_m,
      gps_pass,
      flagged: record.flagged ?? false,
    });
  } catch (err) {
    console.error("[checkin]", err);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
