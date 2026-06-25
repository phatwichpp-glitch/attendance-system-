import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getCourses, getStudents, getSessions, getAttendanceForCourse, getSpreadsheetId,
} from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { courseId } = params;
    const spreadsheetId = await getSpreadsheetId(session.access_token);

    const [courses, allStudents, allSessions, attendance] = await Promise.all([
      getCourses(session.access_token, spreadsheetId),
      getStudents(session.access_token, spreadsheetId, courseId),
      getSessions(session.access_token, spreadsheetId),
      getAttendanceForCourse(session.access_token, spreadsheetId, courseId),
    ]);

    const course = courses.find((c) => c.course_id === courseId);
    const sessions = allSessions
      .filter((s) => s.course_id === courseId && s.closed_at)
      .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

    const students = allStudents.sort((a, b) => a.order_num - b.order_num);

    return NextResponse.json({ course, sessions, students, attendance });
  } catch (err) {
    console.error("summary error:", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
