import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, editAttendanceRecord } from "@/lib/sheets";
import { AttendanceStatus } from "@/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ attendanceId: string }> }
) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { attendanceId } = await params;
    const { status, edit_note = "" }: { status: AttendanceStatus; edit_note?: string } = await req.json();

    if (!["present", "late", "absent", "gps_fail"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const result = await editAttendanceRecord(
      session.access_token, spreadsheetId, attendanceId, status, edit_note
    );

    if (!result) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[attendance PATCH]", err);
    return NextResponse.json({ error: "Edit failed" }, { status: 500 });
  }
}
