import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getCourses, getCourseStats } from "@/lib/sheets";

export async function GET() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const [courses, stats] = await Promise.all([
      getCourses(session.access_token, spreadsheetId),
      getCourseStats(session.access_token, spreadsheetId).catch(() => ({})),
    ]);
    return NextResponse.json({ courses, stats, spreadsheetId });
  } catch (err) {
    console.error("[courses]", err);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
