import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  editAttendanceRecord,
  deleteAttendanceById,
  appendAuditLog,
} from "@/lib/sheets";
import { AttendanceStatus } from "@/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ attendanceId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { attendanceId } = await params;
    const body = await req.json();
    const status: AttendanceStatus = body.status;
    const edit_note: string = body.edit_note ?? body.note ?? "";

    if (!["present", "late", "absent", "gps_fail"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const result = await editAttendanceRecord(
      session.access_token, spreadsheetId, attendanceId, status, edit_note
    );

    if (!result) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "update", entity_type: "attendance", entity_id: attendanceId,
      changed_from: { status: result.editedFrom }, changed_to: { status },
      note: edit_note,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[attendance PATCH]", err);
    return NextResponse.json({ error: "Edit failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ attendanceId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { attendanceId } = await params;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const ok = await deleteAttendanceById(session.access_token, spreadsheetId, attendanceId);

    if (!ok) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "delete", entity_type: "attendance", entity_id: attendanceId,
      changed_from: { attendance_id: attendanceId }, changed_to: {},
      note: "Deleted by teacher",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[attendance DELETE]", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
