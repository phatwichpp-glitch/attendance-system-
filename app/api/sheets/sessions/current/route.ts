import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getAllSessions } from "@/lib/sheets";

// Resolves "the session currently open for this course+section", used by the stable
// classroom display (app/projector/course/[courseId]) since auto-opened sessions have
// no fixed sessionId a teacher can bookmark ahead of time.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const course_id = req.nextUrl.searchParams.get("course_id");
  const section = req.nextUrl.searchParams.get("section");
  if (!course_id || !section) {
    return NextResponse.json({ error: "course_id and section are required" }, { status: 400 });
  }

  try {
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const allSessions = await getAllSessions(session.access_token, spreadsheetId);
    const open = allSessions
      .filter((s) => s.course_id === course_id && s.section === section && s.opened_at && !s.closed_at)
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

    return NextResponse.json({ session: open[0] ?? null });
  } catch (err) {
    console.error("[sessions/current]", err);
    return NextResponse.json({ error: "Failed to fetch current session" }, { status: 500 });
  }
}
