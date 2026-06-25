import { NextRequest, NextResponse } from "next/server";
import {
  getSession, getStudents, getAttendanceForSession, createAttendance,
  haversineDistance, generateId, findOrCreateSpreadsheet,
} from "@/lib/sheets";
import { AttendanceRecord } from "@/lib/types";

// Public route — no auth() required. Uses teacher's spreadsheet via session_id lookup.
// We need to find whose spreadsheet owns this session. We do this by accepting spreadsheetId in the body.
export async function POST(req: NextRequest) {
  try {
    const { session_id, otp, student_id, lat, lng, spreadsheet_id } = await req.json();

    if (!spreadsheet_id) {
      return NextResponse.json({ error: "Missing spreadsheet_id" }, { status: 400 });
    }

    // Use a service account or require the teacher to encode their token in the QR URL is complex.
    // Instead: the QR URL encodes spreadsheet_id (public, not sensitive) and we use a
    // dedicated service-account credential for read access, OR we pass the access token
    // from the teacher's session via a server-side lookup.
    // Simple approach: store spreadsheet_id publicly; check-in reads with no auth for public data
    // by using the Sheets API with an API key (for read) and writing requires a stored token.
    //
    // Pragmatic: require GOOGLE_SHEETS_API_KEY env for public read + service account for write.
    // For this system we use a workaround: encode the access_token in a signed cookie set when
    // teacher opens the session page. Since /check is public, we read a server-side session store.
    //
    // Simplest production-ready: pass teacher's spreadsheetId in QR, and use a server-side
    // cache (Map) keyed by spreadsheet_id → access_token (refreshed on session open).
    // This works for single-server; for multi-server use Redis.

    const accessToken = tokenStore.get(spreadsheet_id);
    if (!accessToken) {
      return NextResponse.json({ error: "Session not available for check-in" }, { status: 403 });
    }

    const session = await getSession(accessToken, spreadsheet_id, session_id);
    if (!session) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    // Check OTP
    if (session.otp !== otp) {
      return NextResponse.json({ error: "invalid_otp" }, { status: 400 });
    }

    // Check expiry
    const openedAt = new Date(session.opened_at).getTime();
    const now = Date.now();
    const expiredAt = openedAt + session.otp_expire_min * 60 * 1000;
    const isClosed = !!session.closed_at;

    if (isClosed || now > expiredAt) {
      return NextResponse.json({ error: "expired" }, { status: 400 });
    }

    // Validate student ID format
    if (!/^\d{9}$/.test(student_id)) {
      return NextResponse.json({ error: "invalid_student_id" }, { status: 400 });
    }

    // Find student
    const students = await getStudents(accessToken, spreadsheet_id, session.course_id, session.section);
    const student = students.find((s) => s.student_id === student_id);
    if (!student) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Check duplicate
    const existing = await getAttendanceForSession(accessToken, spreadsheet_id, session_id);
    const dup = existing.find((a) => a.student_id === student_id);
    if (dup) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        status: dup.status,
        student: { firstname: student.firstname, lastname: student.lastname },
      });
    }

    // GPS check
    let gps_pass = false;
    let distance_m = 0;
    if (lat != null && lng != null) {
      distance_m = Math.round(haversineDistance(lat, lng, session.lat, session.lng));
      gps_pass = distance_m <= session.radius_m;
    }

    // Determine status
    const lateThreshold = openedAt + session.late_after_min * 60 * 1000;
    let status: AttendanceRecord["status"];
    if (!gps_pass) {
      status = "gps_fail";
    } else if (now > lateThreshold) {
      status = "late";
    } else {
      status = "present";
    }

    const record: AttendanceRecord = {
      attendance_id: generateId(),
      session_id,
      course_id: session.course_id,
      student_id,
      firstname: student.firstname,
      lastname: student.lastname,
      status,
      gps_pass,
      distance_m,
      checked_at: new Date().toISOString(),
      overridden: false,
      overridden_at: "",
    };

    await createAttendance(accessToken, spreadsheet_id, record);

    return NextResponse.json({
      success: true,
      status,
      distance_m,
      student: { firstname: student.firstname, lastname: student.lastname },
    });
  } catch (err) {
    console.error("checkin error:", err);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}

// In-memory token store: spreadsheetId → accessToken
// Populated when teacher opens a session (POST /api/sheets/sessions calls registerToken)
export const tokenStore = new Map<string, string>();

export function registerToken(spreadsheetId: string, accessToken: string) {
  tokenStore.set(spreadsheetId, accessToken);
}
