import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDriveClient, getSheetsClient } from "@/lib/sheets";

// Ad-hoc diagnostic for the "duplicate AttendanceDB" class of bugs — lets whoever
// is debugging see the raw Drive/Sheets state for their OWN account (auth-gated,
// read-only) without Vercel log access or manually digging through Google Drive.
// Pass ?session_id=... to check which file (if any) actually contains a specific
// session — the direct answer to "why does this session 404".
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionIdToFind = req.nextUrl.searchParams.get("session_id") ?? undefined;
  const drive = getDriveClient(session.access_token);
  const sheets = getSheetsClient(session.access_token);

  // No trashed filter — a prior (possibly failed) self-heal attempt may have
  // already trashed a duplicate that still holds the answer.
  const res = await drive.files.list({
    q: "name='AttendanceDB' and mimeType='application/vnd.google-apps.spreadsheet'",
    fields: "files(id,name,createdTime,trashed)",
    orderBy: "createdTime",
    spaces: "drive",
  });
  const files = res.data.files ?? [];

  const readCount = async (spreadsheetId: string, range: string): Promise<number | null> => {
    try {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return (r.data.values ?? []).length;
    } catch {
      return null; // tab doesn't exist in this spreadsheet
    }
  };

  const findSessionId = async (spreadsheetId: string): Promise<boolean | null> => {
    if (!sessionIdToFind) return null;
    try {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: "sessions!A2:V" });
      return (r.data.values ?? []).some((row) => row[0] === sessionIdToFind);
    } catch {
      return null;
    }
  };

  const details = await Promise.all(
    files.map(async (f) => ({
      id: f.id,
      createdTime: f.createdTime,
      trashed: f.trashed ?? false,
      rowCounts: {
        courses: await readCount(f.id!, "courses!A2:F"),
        students: await readCount(f.id!, "students!A2:F"),
        sessions: await readCount(f.id!, "sessions!A2:V"),
        attendance: await readCount(f.id!, "attendance!A2:Z"),
      },
      hasSessionId: await findSessionId(f.id!),
    }))
  );

  return NextResponse.json({
    account_email: session.user?.email,
    searched_session_id: sessionIdToFind ?? null,
    file_count: files.length,
    files: details,
  });
}
