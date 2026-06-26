import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  updateSessionById,
  deleteSessionById,
  reopenSession,
  getAttendanceForSession,
  appendAuditLog,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    const { week_label, date, period, week_number, reopen, activate } = await req.json();

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const current = await getSessionById(session.access_token, spreadsheetId, sessionId);
    if (!current) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    if (reopen) {
      const ok = await reopenSession(session.access_token, spreadsheetId, sessionId);
      if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      await appendAuditLog(session.access_token, spreadsheetId, {
        action: "update", entity_type: "session", entity_id: sessionId,
        changed_from: { closed_at: current.closed_at }, changed_to: { closed_at: "" },
        note: "Session reopened",
      });
      return NextResponse.json({ success: true, action: "reopened" });
    }

    // Activate Part 2 (set opened_at = now, register in session-store)
    if (activate) {
      if (current.opened_at) return NextResponse.json({ error: "Session already active" }, { status: 400 });
      const openedAt = new Date().toISOString();
      const ok = await updateSessionById(session.access_token, spreadsheetId, sessionId, { opened_at: openedAt });
      if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      registerSession(sessionId, spreadsheetId, session.access_token, current.otp);
      await appendAuditLog(session.access_token, spreadsheetId, {
        action: "update", entity_type: "session", entity_id: sessionId,
        changed_from: { opened_at: "" }, changed_to: { opened_at: openedAt },
        note: "Part 2 activated",
      });
      return NextResponse.json({ success: true, action: "activated", session: { ...current, opened_at: openedAt } });
    }

    const updates = { week_label, date, period, week_number };
    const ok = await updateSessionById(session.access_token, spreadsheetId, sessionId, updates);
    if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "update", entity_type: "session", entity_id: sessionId,
      changed_from: current, changed_to: { ...current, ...updates }, note: "Session info updated",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sessions/[sessionId] PATCH]", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const [sessionData, attendance] = await Promise.all([
      getSessionById(session.access_token, spreadsheetId, sessionId),
      getAttendanceForSession(session.access_token, spreadsheetId, sessionId),
    ]);

    await appendAuditLog(session.access_token, spreadsheetId, {
      action: "delete", entity_type: "session", entity_id: sessionId,
      changed_from: sessionData ?? { session_id: sessionId },
      changed_to: {},
      note: `Deleted with ${attendance.length} attendance records`,
    });

    await deleteSessionById(session.access_token, spreadsheetId, sessionId);

    return NextResponse.json({ success: true, attendance_deleted: attendance.length });
  } catch (err) {
    console.error("[sessions/[sessionId] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
