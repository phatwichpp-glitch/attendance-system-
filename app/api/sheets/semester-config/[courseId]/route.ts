import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getSemesterConfig, upsertSemesterConfig } from "@/lib/sheets";
import { SemesterConfig } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { courseId } = await params;
    const section = req.nextUrl.searchParams.get("section") ?? undefined;
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const config = await getSemesterConfig(session.access_token, spreadsheetId, courseId, section);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[semester-config GET]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { courseId } = await params;
    const body: Partial<SemesterConfig> = await req.json();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const existing = await getSemesterConfig(
      session.access_token, spreadsheetId, courseId, body.section
    );
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await upsertSemesterConfig(session.access_token, spreadsheetId, {
      ...existing,
      ...body,
      course_id: courseId,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[semester-config PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
