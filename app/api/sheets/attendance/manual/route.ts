import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getStudents,
  addAttendance,
  appendAuditLog,
} from "@/lib/sheets";
import { AttendanceRecord, AttendanceStatus } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const {
      session_id, course_id, section, student_id,
      status = "present", note = "", checked_at,
    } = await req.json();

    if (!["present", "late", "absent"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const students = await getStudents(session.access_token, spreadsheetId, course_id, section);
    const student = students.find((s) => s.student_id === student_id);
    if (!student) return NextResponse.json({ error: "Student not in this course" }, { status: 404 });

    const now = checked_at ?? new Date().toISOString();
    const record: AttendanceRecord = {
      attendance_id: `${session_id}_${student_id}`,
      session_id,
      course_id,
      student_id,
      firstname: student.firstname,
      lastname: student.lastname,
      status: status as AttendanceStatus,
      gps_pass: true,
      distance_m: 0,
      checked_at: now,
      overridden: false,
      overridden_at: "",
      device_fingerprint: "",
      is_manual_entry: true,
      edit_note: note,
    };

    await addAttendance(session.access_token, spreadsheetId, record);
    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "create", entity_type: "attendance", entity_id: record.attendance_id,
      changed_from: {}, changed_to: record, note: note || "Manual attendance entry",
    });

    return NextResponse.json({ success: true, record });
  } catch (err) {
    console.error("[attendance manual POST]", err);
    return NextResponse.json({ error: "Failed to add manual attendance" }, { status: 500 });
  }
}
