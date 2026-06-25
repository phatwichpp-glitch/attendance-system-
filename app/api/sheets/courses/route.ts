import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCourses, getSpreadsheetId } from "@/lib/sheets";

export async function GET() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = await getSpreadsheetId(session.access_token);
    const courses = await getCourses(session.access_token, spreadsheetId);
    return NextResponse.json({ courses, spreadsheetId });
  } catch (err) {
    console.error("courses error:", err);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
