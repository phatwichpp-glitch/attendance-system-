import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  getStudents,
  getAttendanceForSession,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { buildDeviceConflicts } from "@/lib/conflict-detection";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { sessionId } = await params;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const sessionData = await getSessionById(
      session.access_token,
      spreadsheetId,
      sessionId
    );
    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Only register in session-store if the session is active (opened but not closed)
    if (sessionData.opened_at && !sessionData.closed_at) {
      await registerSession(sessionId, spreadsheetId, session.access_token, sessionData.otp);
    }

    // Fetch linked session if this is a two-check-in double period
    let linked_session = null;
    if (sessionData.linked_session_id) {
      linked_session = await getSessionById(
        session.access_token,
        spreadsheetId,
        sessionData.linked_session_id
      );
    }

    const [students, attendance] = await Promise.all([
      getStudents(
        session.access_token,
        spreadsheetId,
        sessionData.course_id,
        sessionData.section
      ),
      getAttendanceForSession(session.access_token, spreadsheetId, sessionId),
    ]);

    const attMap = new Map(attendance.map((a) => [a.student_id, a]));
    const studentList = students
      .sort((a, b) => a.order_num - b.order_num)
      .map((s) => ({ ...s, attendance: attMap.get(s.student_id) ?? null }));

    // Build device conflict groups (confirmed: same fingerprint/GPU hash; possible: same IP + close time/GPS)
    const device_conflicts = buildDeviceConflicts(attendance);

    // For Part 2 sessions: fetch Part 1 attendance for comparison panel
    let part1_attendance = null;
    if (sessionData.part_number === 2 && sessionData.linked_session_id) {
      part1_attendance = await getAttendanceForSession(
        session.access_token,
        spreadsheetId,
        sessionData.linked_session_id
      );
    }

    return NextResponse.json({
      session: sessionData,
      students: studentList,
      spreadsheetId,
      device_conflicts,
      linked_session,
      part1_attendance,
    });
  } catch (err) {
    console.error("[session GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
