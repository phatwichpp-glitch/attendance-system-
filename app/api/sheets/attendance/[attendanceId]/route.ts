import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  editAttendanceRecord,
  deleteAttendanceById,
  updateAttendanceFields,
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
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const now = new Date().toISOString();

    // ── Unified action handling ────────────────────────────────────────────
    if (body.action) {
      const action = body.action as "approve" | "flag" | "mark_absent" | "revoke";

      switch (action) {
        case "approve": {
          const note = typeof body.note === "string" ? body.note.trim() : "";
          const prev = await updateAttendanceFields(session.access_token, spreadsheetId, attendanceId, {
            overridden: true,
            overridden_at: now,
            action_taken: "approve",
            action_taken_at: now,
            edit_note: note,
          });
          if (!prev.found) return NextResponse.json({ error: "Record not found" }, { status: 404 });

          // If was gps_fail, upgrade status to present
          if (prev.previousStatus === "gps_fail") {
            await updateAttendanceFields(session.access_token, spreadsheetId, attendanceId, {
              status: "present",
            });
          }
          await appendAuditLog(session.access_token, spreadsheetId, {
            action: "update", entity_type: "attendance", entity_id: attendanceId,
            changed_from: { overridden: false, status: prev.previousStatus },
            changed_to: { overridden: true, action: "approve" },
            note: note ? `Teacher approved — ${note}` : "Teacher approved",
          });
          return NextResponse.json({ success: true });
        }

        case "flag": {
          const prev = await updateAttendanceFields(session.access_token, spreadsheetId, attendanceId, {
            flagged: true,
            flagged_at: now,
            action_taken: "flag",
            action_taken_at: now,
          });
          if (!prev.found) return NextResponse.json({ error: "Record not found" }, { status: 404 });
          await appendAuditLog(session.access_token, spreadsheetId, {
            action: "update", entity_type: "attendance", entity_id: attendanceId,
            changed_from: { flagged: false }, changed_to: { flagged: true, flagged_at: now },
            note: "Teacher flagged as suspicious",
          });
          return NextResponse.json({ success: true });
        }

        case "mark_absent": {
          const prev = await updateAttendanceFields(session.access_token, spreadsheetId, attendanceId, {
            status: "absent",
            action_taken: "mark_absent",
            action_taken_at: now,
          });
          if (!prev.found) return NextResponse.json({ error: "Record not found" }, { status: 404 });
          await appendAuditLog(session.access_token, spreadsheetId, {
            action: "update", entity_type: "attendance", entity_id: attendanceId,
            changed_from: { status: prev.previousStatus },
            changed_to: { status: "absent", action: "mark_absent" },
            note: "Marked absent by teacher",
          });
          return NextResponse.json({ success: true, previousStatus: prev.previousStatus });
        }

        case "revoke": {
          const prev = await updateAttendanceFields(session.access_token, spreadsheetId, attendanceId, {
            overridden: false,
            action_taken: "revoke",
            action_taken_at: now,
          });
          if (!prev.found) return NextResponse.json({ error: "Record not found" }, { status: 404 });
          await appendAuditLog(session.access_token, spreadsheetId, {
            action: "update", entity_type: "attendance", entity_id: attendanceId,
            changed_from: { overridden: true }, changed_to: { overridden: false, action: "revoke" },
            note: "Approval revoked by teacher",
          });
          return NextResponse.json({ success: true });
        }

        default:
          return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      }
    }

    // ── Standard status edit (existing behavior) ───────────────────────────
    const status: AttendanceStatus = body.status;
    const edit_note: string = body.edit_note ?? body.note ?? "";

    if (!["present", "late", "absent", "gps_fail"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

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
