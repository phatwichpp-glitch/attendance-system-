import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getCourses,
  getStudents,
  getAllSessions,
  getAttendanceForCourse,
  getSemesterConfig,
} from "@/lib/sheets";
import { AttendanceStatus } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { courseId } = await params;
    // Without a section filter, two sections of the same course would merge
    // into one grid — every other query in the app is keyed course+section.
    const section = req.nextUrl.searchParams.get("section") ?? undefined;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const [courses, students, allSessions, attendanceAll, semesterConfig] = await Promise.all([
      getCourses(session.access_token, spreadsheetId),
      getStudents(session.access_token, spreadsheetId, courseId, section),
      getAllSessions(session.access_token, spreadsheetId),
      getAttendanceForCourse(session.access_token, spreadsheetId, courseId),
      getSemesterConfig(session.access_token, spreadsheetId, courseId, section).catch(() => null),
    ]);

    const course = courses.find(
      (c) => c.course_id === courseId && (!section || c.section === section)
    );
    const sessions = allSessions
      .filter((s) => s.course_id === courseId && (!section || s.section === section) && s.closed_at)
      .sort((a, b) => a.date.localeCompare(b.date) || a.opened_at.localeCompare(b.opened_at));

    const sessionIds = new Set(sessions.map((s) => s.session_id));
    const attendance = section
      ? attendanceAll.filter((r) => sessionIds.has(r.session_id))
      : attendanceAll;

    const sortedStudents = students.sort((a, b) => a.order_num - b.order_num);

    const grid: Record<string, Record<string, AttendanceStatus | "overridden">> = {};
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
        present_count: 0, late_count: 0, absent_count: 0,
        gps_fail_count: 0, total_sessions: sessions.length, percentage: 0,
      };
    }

    for (const rec of attendance) {
      if (grid[rec.student_id] !== undefined) {
        const effective = rec.overridden ? "present" : rec.status;
        grid[rec.student_id][rec.session_id] = effective;
        const t = totals[rec.student_id];
        if (effective === "present") t.present_count++;
        else if (effective === "late") t.late_count++;
        else if (effective === "absent") t.absent_count++;
        else if (effective === "gps_fail") t.gps_fail_count++;
      }
    }

    for (const sid of Object.keys(totals)) {
      const t = totals[sid];
      t.percentage = t.total_sessions > 0
        ? Math.round(((t.present_count + t.late_count) / t.total_sessions) * 100)
        : 0;
    }

    return NextResponse.json({
      course, sessions, students: sortedStudents, attendance, grid, totals,
      semester_config: semesterConfig ?? null,
    });
  } catch (err) {
    console.error("[summary]", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
