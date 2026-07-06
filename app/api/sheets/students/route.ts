import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getStudents,
  addStudent,
  appendAuditLog,
  getMaxOrderNum,
} from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const course_id = searchParams.get("course_id") ?? "";
    const section = searchParams.get("section") ?? "";
    if (!course_id || !section) {
      return NextResponse.json({ error: "course_id and section are required" }, { status: 400 });
    }
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const students = await getStudents(session.access_token, spreadsheetId, course_id, section);
    return NextResponse.json({ students });
  } catch (err) {
    console.error("[students GET]", err);
    return NextResponse.json({ error: "Failed to load students" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { course_id, section, student_id, firstname, lastname } = await req.json();

    if (!/^\d{9}$/.test(student_id)) {
      return NextResponse.json({ error: "Student ID must be 9 digits" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const existing = await getStudents(session.access_token, spreadsheetId, course_id, section);

    if (existing.some((s) => s.student_id === student_id)) {
      return NextResponse.json({ error: "Student ID already exists in this course" }, { status: 409 });
    }

    const maxOrder = await getMaxOrderNum(session.access_token, spreadsheetId, course_id, section);
    const student = { student_id, firstname, lastname, course_id, section, order_num: maxOrder + 1 };

    await addStudent(session.access_token, spreadsheetId, student);
    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "create", entity_type: "student", entity_id: student_id,
      changed_from: {}, changed_to: student, note: "Manual add",
    });

    return NextResponse.json({ success: true, student });
  } catch (err) {
    console.error("[students POST]", err);
    return NextResponse.json({ error: "Failed to add student" }, { status: 500 });
  }
}
