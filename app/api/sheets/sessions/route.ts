import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSession, closeSession, markAbsentees, getSpreadsheetId, generateOTP, generateId,
} from "@/lib/sheets";
import { tokenStore } from "@/app/api/sheets/checkin/route";
import { Session } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      course_id, section, period, date, lat, lng,
      radius_m, late_after_min, otp_expire_min,
    } = body;

    const sessionData: Session = {
      session_id: generateId(),
      course_id,
      section,
      period,
      date,
      otp: generateOTP(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_m: parseInt(radius_m, 10),
      late_after_min: parseInt(late_after_min, 10),
      otp_expire_min: parseInt(otp_expire_min, 10),
      opened_at: new Date().toISOString(),
      closed_at: "",
    };

    const spreadsheetId = await getSpreadsheetId(session.access_token);
    await createSession(session.access_token, spreadsheetId, sessionData);

    // Register token so public /check can write to this spreadsheet
    tokenStore.set(spreadsheetId, session.access_token);

    return NextResponse.json({ session: sessionData, spreadsheetId });
  } catch (err) {
    console.error("open session error:", err);
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
    const spreadsheetId = await getSpreadsheetId(session.access_token);

    await closeSession(session.access_token, spreadsheetId, session_id, closedAt);
    await markAbsentees(session.access_token, spreadsheetId, session_id, course_id, section, closedAt);

    return NextResponse.json({ success: true, closed_at: closedAt });
  } catch (err) {
    console.error("close session error:", err);
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
