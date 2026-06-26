import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  createSession,
  closeSessionInSheet,
  markAbsentStudents,
  getAllSessions,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { generateOTP } from "@/lib/otp";
import { Session } from "@/types";
import { getWeekLabel } from "@/lib/week-utils";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      course_id,
      section,
      period,
      lat,
      lng,
      radius_m,
      late_after_min,
      otp_expire_min,
      week_number,
      week_label,
      date: bodyDate,
      is_past_session = false,
      semester_start,
      teaching_days,
    } = body;

    const today = bodyDate ?? new Date().toISOString().split("T")[0];

    // Auto-calculate week label if not supplied but semester_start given
    let resolvedWeekNumber: number | undefined = week_number;
    let resolvedWeekLabel: string | undefined = week_label;

    if (semester_start && !week_label) {
      const spreadsheetId = await initializeSpreadsheet(session.access_token);
      const allSessions = await getAllSessions(session.access_token, spreadsheetId);
      const sessionDate = new Date(today);
      const semStart = new Date(semester_start);
      const weekNum = Math.max(1, Math.ceil(
        (sessionDate.getTime() - semStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      ));
      const sessionsThisWeek = allSessions.filter((s) => {
        if (s.course_id !== course_id || s.section !== section) return false;
        if (!s.week_number) return false;
        return s.week_number === weekNum;
      }).length;
      const days: number[] = Array.isArray(teaching_days) ? teaching_days : [];
      const computed = getWeekLabel(sessionDate, semStart, days, sessionsThisWeek);
      resolvedWeekNumber = computed.weekNumber;
      resolvedWeekLabel = computed.label;
    }

    const sessionData: Session = {
      session_id: crypto.randomUUID(),
      course_id,
      section,
      period,
      date: today,
      otp: generateOTP(),
      lat: is_past_session ? 0 : parseFloat(lat),
      lng: is_past_session ? 0 : parseFloat(lng),
      radius_m: parseInt(radius_m, 10),
      late_after_min: parseInt(late_after_min, 10),
      otp_expire_min: parseInt(otp_expire_min, 10),
      opened_at: new Date().toISOString(),
      closed_at: is_past_session ? new Date().toISOString() : "",
      week_number: resolvedWeekNumber,
      week_label: resolvedWeekLabel,
      is_past_session: !!is_past_session,
    };

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    await createSession(session.access_token, spreadsheetId, sessionData);

    // Register in session-store (with OTP for manual check-in mode)
    registerSession(sessionData.session_id, spreadsheetId, session.access_token, sessionData.otp);

    return NextResponse.json({ session: sessionData, spreadsheetId });
  } catch (err) {
    console.error("[sessions POST]", err);
    return NextResponse.json({ error: "Failed to open session" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { session_id, course_id, section } = await req.json();
    const closedAt = new Date().toISOString();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const sessionData = await getSessionById(session.access_token, spreadsheetId, session_id);

    await closeSessionInSheet(session.access_token, spreadsheetId, session_id, closedAt);
    await markAbsentStudents(
      session.access_token, spreadsheetId, session_id,
      course_id ?? sessionData?.course_id, section ?? sessionData?.section, closedAt
    );

    return NextResponse.json({ success: true, closed_at: closedAt });
  } catch (err) {
    console.error("[sessions PATCH]", err);
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
