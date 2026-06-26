import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  getStudents,
  getAttendanceForSession,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { DeviceConflict } from "@/types";

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
      registerSession(sessionId, spreadsheetId, session.access_token, sessionData.otp);
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

    // Build device conflict groups
    const fpMap = new Map<string, { student_id: string; firstname: string; lastname: string; checked_at: string; status?: string }[]>();
    for (const a of attendance) {
      const fp = a.device_fingerprint;
      if (!fp) continue;
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      fpMap.get(fp)!.push({ student_id: a.student_id, firstname: a.firstname, lastname: a.lastname, checked_at: a.checked_at, status: a.status });
    }
    const device_conflicts: DeviceConflict[] = [];
    for (const [fingerprint, studs] of fpMap) {
      if (studs.length > 1) device_conflicts.push({ fingerprint, students: studs });
    }

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
