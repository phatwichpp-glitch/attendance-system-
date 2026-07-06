import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getAuditLog, getAllAttendance, getAllSessions } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const studentQuery = (searchParams.get("student") ?? "").trim().toLowerCase();
    const filters = {
      entity_type: searchParams.get("entity_type") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    };
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const entries = await getAuditLog(session.access_token, spreadsheetId, filters);

    // AuditLog only stores a raw entity_id (an attendance_id for entity_type
    // "attendance") — join against the attendance/sessions sheets so the admin
    // UI can show a student name and session date instead of an opaque ID, and
    // so a teacher can search "why was this student marked absent" by name.
    const attendanceEntityIds = new Set(
      entries.filter((e) => e.entity_type === "attendance").map((e) => e.entity_id)
    );
    let enriched = entries.map((e) => ({ ...e } as typeof e & {
      student_id?: string; student_name?: string; course_id?: string; session_date?: string;
    }));

    if (attendanceEntityIds.size > 0) {
      const [attendance, sessions] = await Promise.all([
        getAllAttendance(session.access_token, spreadsheetId),
        getAllSessions(session.access_token, spreadsheetId),
      ]);
      const attById = new Map(attendance.map((a) => [a.attendance_id, a]));
      const sessionById = new Map(sessions.map((s) => [s.session_id, s]));

      enriched = enriched.map((e) => {
        if (e.entity_type !== "attendance") return e;
        const att = attById.get(e.entity_id);
        if (!att) return e;
        const sess = sessionById.get(att.session_id);
        return {
          ...e,
          student_id: att.student_id,
          student_name: `${att.firstname} ${att.lastname}`,
          course_id: att.course_id,
          session_date: sess?.date,
        };
      });
    }

    const filtered = studentQuery
      ? enriched.filter((e) =>
          e.student_name?.toLowerCase().includes(studentQuery) ||
          e.student_id?.includes(studentQuery)
        )
      : enriched;

    return NextResponse.json({ entries: filtered });
  } catch (err) {
    console.error("[audit GET]", err);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
