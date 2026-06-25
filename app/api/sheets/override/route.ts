import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, overrideAttendanceRecord } from "@/lib/sheets";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { attendance_id } = await req.json();
    const overriddenAt = new Date().toISOString();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    await overrideAttendanceRecord(
      session.access_token,
      spreadsheetId,
      attendance_id,
      overriddenAt
    );

    return NextResponse.json({ success: true, overridden_at: overriddenAt });
  } catch (err) {
    console.error("[override]", err);
    return NextResponse.json({ error: "Override failed" }, { status: 500 });
  }
}
