import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getAuditLog } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const filters = {
      entity_type: searchParams.get("entity_type") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    };
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const entries = await getAuditLog(session.access_token, spreadsheetId, filters);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[audit GET]", err);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
