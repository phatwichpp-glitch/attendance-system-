import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOrCreateSpreadsheet } from "@/lib/sheets";

export async function POST() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = await findOrCreateSpreadsheet(session.access_token);
    return NextResponse.json({ spreadsheetId });
  } catch (err) {
    console.error("init error:", err);
    return NextResponse.json({ error: "Failed to initialize spreadsheet" }, { status: 500 });
  }
}
