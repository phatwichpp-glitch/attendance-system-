import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getCourses,
  getStudents,
  getAllSessions,
  getAttendanceForCourse,
} from "@/lib/sheets";
import { AttendanceStatus } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { courseId } = await params;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const [courses, students, allSessions, attendance] = await Promise.all([
      getCourses(session.access_token, spreadsheetId),
      getStudents(session.access_token, spreadsheetId, courseId),
      getAllSessions(session.access_token, spreadsheetId),
      getAttendanceForCourse(session.access_token, spreadsheetId, courseId),
    ]);

    const course = courses.find((c) => c.course_id === courseId);
    const sessions = allSessions
      .filter((s) => s.course_id === courseId && s.closed_at)
      .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

    const sortedStudents = students.sort((a, b) => a.order_num - b.order_num);

    // Build grid
    const grid: Record<string, Record<string, AttendanceStatus>> = {};
    const totals: Record<string, {
      present_count: number;
      late_count: number;
      absent_count: number;
      gps_fail_count: number;
      total_sessions: number;
      percentage: number;
    }> = {};

    for (const s of sortedStudents) {
      grid[s.student_id] = {};
      totals[s.student_id] = {
        present_count: 0,
        late_count: 0,
        absent_count: 0,
        gps_fail_count: 0,
        total_sessions: sessions.length,
        percentage: 0,
      };
    }

    for (const rec of attendance) {
      if (grid[rec.student_id] !== undefined) {
        const status =
          rec.overridden ? "present" : rec.status;
        grid[rec.student_id][rec.session_id] = status;
        const t = totals[rec.student_id];
        if (status === "present") t.present_count++;
        else if (status === "late") t.late_count++;
        else if (status === "absent") t.absent_count++;
        else if (status === "gps_fail") t.gps_fail_count++;
      }
    }

    for (const sid of Object.keys(totals)) {
      const t = totals[sid];
      t.percentage =
        t.total_sessions > 0
          ? Math.round(
              ((t.present_count + t.late_count) / t.total_sessions) * 100
            )
          : 0;
    }

    return NextResponse.json({ course, sessions, students: sortedStudents, attendance, grid, totals });
  } catch (err) {
    console.error("[summary]", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
