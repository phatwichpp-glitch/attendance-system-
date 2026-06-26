import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getCourses,
  updateCourseById,
  deleteCourseById,
  appendAuditLog,
  getStudents,
  getAllSessions,
} from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { courseId } = await params;
    const { section, title, lecturer, course_id: newCourseId, semester, year } = await req.json();

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const courses = await getCourses(session.access_token, spreadsheetId);
    const current = courses.find((c) => c.course_id === courseId && c.section === section);
    if (!current) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const updates = { title, lecturer, course_id: newCourseId, semester, year };
    const ok = await updateCourseById(
      session.access_token, spreadsheetId, courseId, section, updates
    );
    if (!ok) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "update", entity_type: "course", entity_id: courseId,
      changed_from: current, changed_to: { ...current, ...updates }, note: "Course info updated",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[courses PATCH]", err);
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { courseId } = await params;
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") ?? "";

    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    // Collect counts for audit log before deletion
    const [students, sessions] = await Promise.all([
      getStudents(session.access_token, spreadsheetId, courseId, section),
      getAllSessions(session.access_token, spreadsheetId),
    ]);
    const sessionCount = sessions.filter(
      (s) => s.course_id === courseId && s.section === section
    ).length;

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "delete", entity_type: "course", entity_id: courseId,
      changed_from: { course_id: courseId, section, student_count: students.length, session_count: sessionCount },
      changed_to: {},
      note: `Deleted course with ${students.length} students and ${sessionCount} sessions`,
    });

    await deleteCourseById(session.access_token, spreadsheetId, courseId, section);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[courses DELETE]", err);
    return NextResponse.json({ error: "Failed to delete course" }, { status: 500 });
  }
}
