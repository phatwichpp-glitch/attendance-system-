import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDriveClient } from "@/lib/sheets";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Downloads a file the admin picked via Google Picker (see ImportClient.tsx)
// and hands back the raw bytes, so the browser can feed it into the exact
// same xlsx-parser.ts pipeline used for a locally-uploaded file — the only
// difference is where the ArrayBuffer came from.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { fileId } = await req.json();
    if (!fileId || typeof fileId !== "string") {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    const drive = getDriveClient(session.access_token);
    const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
    const mimeType = meta.data.mimeType ?? "";
    const name = meta.data.name ?? "import";

    // Native Google Sheets files have no raw bytes to download — export them
    // as .xlsx instead. Anything else (actual .xlsx/.xls/.csv in Drive)
    // downloads directly via alt=media.
    const isGoogleNative = mimeType.startsWith("application/vnd.google-apps.");
    const res = isGoogleNative
      ? await drive.files.export(
          { fileId, mimeType: XLSX_MIME },
          { responseType: "arraybuffer" }
        )
      : await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" }
        );

    const buffer = Buffer.from(res.data as ArrayBuffer);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(isGoogleNative ? `${name}.xlsx` : name),
      },
    });
  } catch (err) {
    console.error("[import drive-file]", err);
    return NextResponse.json({ error: "Failed to fetch file from Drive" }, { status: 500 });
  }
}
