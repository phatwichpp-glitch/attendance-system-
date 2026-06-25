import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  getStudents,
  getAttendanceForSession,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";

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

    // Keep session-store fresh for ongoing polling
    registerSession(sessionId, spreadsheetId, session.access_token);

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

    return NextResponse.json({
      session: sessionData,
      students: studentList,
      spreadsheetId,
    });
  } catch (err) {
    console.error("[session GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
