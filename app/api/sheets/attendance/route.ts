import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getStudents,
  getAttendanceForSession,
  addAttendance,
  markAbsentStudents,
} from "@/lib/sheets";
import { AttendanceRecord, AttendanceStatus } from "@/types";

interface BulkEntry {
  student_id: string;
  status: AttendanceStatus;
}

interface BulkBody {
  session_id: string;
  course_id: string;
  section: string;
  entries: BulkEntry[];
}

// POST /api/sheets/attendance — bulk manual entry for past sessions (teacher auth required)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body: BulkBody = await req.json();
    const { session_id, course_id, section, entries } = body;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const students = await getStudents(session.access_token, spreadsheetId, course_id, section);
    const existing = await getAttendanceForSession(session.access_token, spreadsheetId, session_id);
    const checkedIds = new Set(existing.map((a) => a.student_id));
    const studentMap = new Map(students.map((s) => [s.student_id, s]));
    const now = new Date().toISOString();

    for (const entry of entries) {
      if (checkedIds.has(entry.student_id)) continue;
      const stu = studentMap.get(entry.student_id);
      if (!stu) continue;
      const record: AttendanceRecord = {
        attendance_id: `${session_id}_${entry.student_id}`,
        session_id,
        course_id,
        student_id: entry.student_id,
        firstname: stu.firstname,
        lastname: stu.lastname,
        status: entry.status,
        gps_pass: true,
        distance_m: 0,
        checked_at: now,
        overridden: false,
        overridden_at: "",
        device_fingerprint: "",
        is_manual_entry: true,
      };
      await addAttendance(session.access_token, spreadsheetId, record);
    }

    // Mark remaining students absent
    await markAbsentStudents(session.access_token, spreadsheetId, session_id, course_id, section, now);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[attendance bulk POST]", err);
    return NextResponse.json({ error: "Bulk entry failed" }, { status: 500 });
  }
}
