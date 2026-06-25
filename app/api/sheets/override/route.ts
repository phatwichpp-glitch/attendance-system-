import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { overrideAttendance, getSpreadsheetId } from "@/lib/sheets";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { attendance_id } = await req.json();
    const overriddenAt = new Date().toISOString();
    const spreadsheetId = await getSpreadsheetId(session.access_token);

    await overrideAttendance(session.access_token, spreadsheetId, attendance_id, overriddenAt);

    return NextResponse.json({ success: true, overridden_at: overriddenAt });
  } catch (err) {
    console.error("override error:", err);
    return NextResponse.json({ error: "Override failed" }, { status: 500 });
  }
}
