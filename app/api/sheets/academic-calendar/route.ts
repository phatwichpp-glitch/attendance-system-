import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { initializeSpreadsheet, getAcademicBlackouts, addAcademicBlackout, deleteAcademicBlackout } from "@/lib/sheets";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const blackouts = await getAcademicBlackouts(session.access_token, spreadsheetId);
    return NextResponse.json({ blackouts });
  } catch (err) {
    console.error("[academic-calendar GET]", err);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const start_date = typeof body.start_date === "string" ? body.start_date.trim() : "";
    const end_date = typeof body.end_date === "string" ? body.end_date.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: "end_before_start" }, { status: 400 });
    }
    if (!label) {
      return NextResponse.json({ error: "label_required" }, { status: 400 });
    }

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const blackout = await addAcademicBlackout(session.access_token, spreadsheetId, { start_date, end_date, label });
    return NextResponse.json({ blackout });
  } catch (err) {
    console.error("[academic-calendar POST]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

    const spreadsheetId = await initializeSpreadsheet(session.access_token);
    const deleted = await deleteAcademicBlackout(session.access_token, spreadsheetId, id);
    if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[academic-calendar DELETE]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
