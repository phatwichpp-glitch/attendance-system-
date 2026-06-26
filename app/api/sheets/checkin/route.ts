import { NextRequest, NextResponse } from "next/server";
import {
  getSessionById,
  getStudents,
  getAttendanceForSession,
  addAttendance,
} from "@/lib/sheets";
import { lookupSession, lookupByOTP } from "@/lib/session-store";
import { calculateDistance } from "@/lib/haversine";
import { AttendanceRecord } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      otp,
      student_id,
      lat,
      lng,
      spreadsheet_id: bodySpreadsheetId,
      device_fingerprint,
    } = body;
    let session_id: string = body.session_id ?? "";

    // Resolve spreadsheet + access token.
    // QR mode:     session_id present  → look up by session_id
    // Manual mode: session_id absent   → look up by OTP (OTP index built while session is polled)
    let spreadsheetId: string = bodySpreadsheetId ?? "";
    let accessToken: string | undefined;

    if (session_id) {
      const stored = lookupSession(session_id);
      spreadsheetId = bodySpreadsheetId ?? stored?.spreadsheetId ?? "";
      accessToken = stored?.accessToken;
    } else if (otp) {
      const byOtp = lookupByOTP(otp);
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
    } else if (now > lateThreshold) {
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
    };

    await addAttendance(accessToken, spreadsheetId, record);

    return NextResponse.json({
      success: true,
      status,
      student: { firstname: student.firstname, lastname: student.lastname },
      checked_at: checkedAt,
      distance_m,
      gps_pass,
    });
  } catch (err) {
    console.error("[checkin]", err);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
