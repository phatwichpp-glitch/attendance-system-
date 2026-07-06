import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  getSessionById,
  getAllSessions,
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

    // Idempotency guard — mirrors lib/scheduler.ts's own check for auto-open, but
    // this manual path previously had none at all, so a double-click or two open
    // tabs could silently create two live sessions splitting OTPs/check-ins.
    const allSessions = await getAllSessions(session.access_token, spreadsheetId);
    const alreadyOpen = allSessions.some((s) =>
      s.course_id === body.course_id &&
      s.section === body.section &&
      s.date === body.date &&
      s.period === body.period &&
      !!s.opened_at &&
      !s.closed_at
    );
    if (alreadyOpen) {
      return NextResponse.json(
        { error: "session_already_open", message: "A session for this course/section/period is already open" },
        { status: 409 }
      );
    }

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
