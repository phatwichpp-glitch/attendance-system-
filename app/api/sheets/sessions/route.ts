import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  initializeSpreadsheet,
  createSession,
  closeSessionInSheet,
  markAbsentStudents,
} from "@/lib/sheets";
import { registerSession } from "@/lib/session-store";
import { generateOTP } from "@/lib/otp";
import { Session } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      course_id,
      section,
      period,
      lat,
      lng,
      radius_m,
      late_after_min,
      otp_expire_min,
    } = body;

    const today = new Date().toISOString().split("T")[0];
    const sessionData: Session = {
      session_id: crypto.randomUUID(),
      course_id,
      section,
      period,
      date: today,
      otp: generateOTP(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_m: parseInt(radius_m, 10),
      late_after_min: parseInt(late_after_min, 10),
      otp_expire_min: parseInt(otp_expire_min, 10),
      opened_at: new Date().toISOString(),
      closed_at: "",
    };

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    await createSession(session.access_token, spreadsheetId, sessionData);

    // Register for public check-in access
    registerSession(sessionData.session_id, spreadsheetId, session.access_token);

    return NextResponse.json({ session: sessionData, spreadsheetId });
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

    await closeSessionInSheet(
      session.access_token,
      spreadsheetId,
      session_id,
      closedAt
    );
    await markAbsentStudents(
      session.access_token,
      spreadsheetId,
      session_id,
      course_id,
      section,
      closedAt
    );

    return NextResponse.json({ success: true, closed_at: closedAt });
  } catch (err) {
    console.error("[sessions PATCH]", err);
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
