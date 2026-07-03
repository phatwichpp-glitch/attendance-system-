import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getCourses, getCourseStats, getAllSemesterConfigs } from "@/lib/sheets";
import { SemesterConfig } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const [courses, stats, configList] = await Promise.all([
      getCourses(session.access_token, spreadsheetId),
      getCourseStats(session.access_token, spreadsheetId).catch(() => ({})),
      getAllSemesterConfigs(session.access_token, spreadsheetId).catch(() => [] as SemesterConfig[]),
    ]);
    const configs: Record<string, SemesterConfig> = {};
    for (const c of configList) configs[`${c.course_id}__${c.section}`] = c;
    return NextResponse.json({ courses, stats, spreadsheetId, configs });
  } catch (err) {
    console.error("[courses]", err);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
