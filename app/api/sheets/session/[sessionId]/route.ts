import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, getStudents, getAttendanceForSession, getSpreadsheetId } from "@/lib/sheets";
import { StudentAttendance } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { sessionId } = params;
    const spreadsheetId = await getSpreadsheetId(session.access_token);
    const sessionData = await getSession(session.access_token, spreadsheetId, sessionId);

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const [students, attendance] = await Promise.all([
      getStudents(session.access_token, spreadsheetId, sessionData.course_id, sessionData.section),
      getAttendanceForSession(session.access_token, spreadsheetId, sessionId),
    ]);

    const attendanceMap = new Map(attendance.map((a) => [a.student_id, a]));

    const studentList: StudentAttendance[] = students
      .sort((a, b) => a.order_num - b.order_num)
      .map((s) => ({ ...s, attendance: attendanceMap.get(s.student_id) }));

    return NextResponse.json({ session: sessionData, students: studentList, spreadsheetId });
  } catch (err) {
    console.error("session detail error:", err);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
