import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  closeSessionInSheet,
  markAbsentStudents,
} from "@/lib/sheets";
import { openSessionForCourse } from "@/lib/session-open";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const result = await openSessionForCourse(session.access_token, spreadsheetId, body);

    if (result.mode === "double") {
      return NextResponse.json({
        session: result.session,
        linked_session: result.linked_session,
        spreadsheetId: result.spreadsheetId,
        mode: "double",
      });
    }

    return NextResponse.json({ session: result.session, spreadsheetId: result.spreadsheetId });
  } catch (err) {
    console.error("[sessions POST]", err);
    return NextResponse.json({ error: "Failed to open session" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { session_id, course_id, section } = await req.json();
    const closedAt = new Date().toISOString();
    const spreadsheetId = await initializeSpreadsheet(session.access_token);

    const sessionData = await getSessionById(session.access_token, spreadsheetId, session_id);

    await closeSessionInSheet(session.access_token, spreadsheetId, session_id, closedAt);
    await markAbsentStudents(
      session.access_token, spreadsheetId, session_id,
      course_id ?? sessionData?.course_id, section ?? sessionData?.section, closedAt
    );

    return NextResponse.json({ success: true, closed_at: closedAt });
  } catch (err) {
    console.error("[sessions PATCH]", err);
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
