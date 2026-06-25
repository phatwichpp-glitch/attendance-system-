import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getCourses } from "@/lib/sheets";

export async function GET() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const courses = await getCourses(session.access_token, spreadsheetId);
    return NextResponse.json({ courses, spreadsheetId });
  } catch (err) {
    console.error("[courses]", err);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
