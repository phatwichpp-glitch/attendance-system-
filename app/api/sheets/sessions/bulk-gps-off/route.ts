import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  bulkDisableGpsForSessions,
  appendAuditLog,
} from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { session_ids } = await req.json();
    if (!Array.isArray(session_ids) || session_ids.length === 0) {
      return NextResponse.json({ error: "session_ids required" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const result = await bulkDisableGpsForSessions(session.access_token, spreadsheetId, session_ids);

    await Promise.all(
      Object.entries(result.perSession).map(([sessionId, count]) =>
        appendAuditLog(session.access_token!, spreadsheetId, {
          action: "update", entity_type: "session", entity_id: sessionId,
          changed_from: { gps_enabled: true }, changed_to: { gps_enabled: false },
          note: `Online session — GPS check disabled, cleared ${count} GPS Fail record(s)`,
        })
      )
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[sessions/bulk-gps-off POST]", err);
    return NextResponse.json({ error: "Failed to update sessions" }, { status: 500 });
  }
}
