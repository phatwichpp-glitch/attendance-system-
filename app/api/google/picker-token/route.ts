import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Google Picker is a client-side widget — it calls the Drive API directly from
// the browser to list/browse the signed-in user's own files, so it needs an
// OAuth access token in hand. This is the one deliberate exception to "the
// client never sees access_token" elsewhere in this app: it's still scoped to
// exactly what the server already does on this user's behalf (spreadsheets +
// drive.file, requested in auth.ts), and it's only ever the CALLER's own
// token — never another admin's.
export async function GET() {
  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ access_token: session.access_token });
}
