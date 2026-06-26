import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, upsertSemesterConfig } from "@/lib/sheets";
import { SemesterConfig } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body: SemesterConfig = await req.json();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    await upsertSemesterConfig(session.access_token, spreadsheetId, {
      ...body,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[semester-config POST]", err);
    return NextResponse.json({ error: "Failed to save semester config" }, { status: 500 });
  }
}
