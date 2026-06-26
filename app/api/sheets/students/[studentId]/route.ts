import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  updateStudentById,
  deleteStudentById,
  deleteAttendanceForStudent,
  appendAuditLog,
  getStudents,
} from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { studentId } = await params;
    const { course_id, section, firstname, lastname, student_id: newId } = await req.json();

    if (newId && !/^\d{9}$/.test(newId)) {
      return NextResponse.json({ error: "Student ID must be 9 digits" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const existing = await getStudents(session.access_token, spreadsheetId, course_id, section);
    const current = existing.find((s) => s.student_id === studentId);
    if (!current) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    if (newId && newId !== studentId && existing.some((s) => s.student_id === newId)) {
      return NextResponse.json({ error: "New student ID already exists" }, { status: 409 });
    }

    const updates = { firstname, lastname, student_id: newId };
    const ok = await updateStudentById(
      session.access_token, spreadsheetId, course_id, section, studentId, updates
    );
    if (!ok) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "update", entity_type: "student", entity_id: studentId,
      changed_from: current, changed_to: { ...current, ...updates }, note: "Manual edit",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[students PATCH]", err);
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { studentId } = await params;
    const { searchParams } = new URL(req.url);
    const course_id = searchParams.get("course_id") ?? "";
    const section = searchParams.get("section") ?? "";

    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const attDeleted = await deleteAttendanceForStudent(
      session.access_token, spreadsheetId, studentId, course_id
    );
    const ok = await deleteStudentById(
      session.access_token, spreadsheetId, course_id, section, studentId
    );
    if (!ok) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "delete", entity_type: "student", entity_id: studentId,
      changed_from: { course_id, section }, changed_to: {},
      note: `Deleted with ${attDeleted} attendance records`,
    });

    return NextResponse.json({ success: true, attendance_deleted: attDeleted });
  } catch (err) {
    console.error("[students DELETE]", err);
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
