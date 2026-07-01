import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNotificationPrefs, setNotificationPrefs, unlinkLine } from "@/lib/token-registry";
import { isLineConfigured } from "@/lib/line-notify";
import { isEmailConfigured } from "@/lib/email-notify";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await getNotificationPrefs(session.user.email);
  return NextResponse.json({
    ...prefs,
    email_available: isEmailConfigured(),
    line_available: isLineConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();

    if (typeof body.notify_email === "string" && body.notify_email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.notify_email.trim())) {
        return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      }
    }

    await setNotificationPrefs(session.user.email, {
      email_notify: typeof body.email_notify === "boolean" ? body.email_notify : undefined,
      notify_email: typeof body.notify_email === "string" ? body.notify_email : undefined,
      line_notify: typeof body.line_notify === "boolean" ? body.line_notify : undefined,
    });
    const prefs = await getNotificationPrefs(session.user.email);
    return NextResponse.json(prefs);
  } catch (err) {
    console.error("[notification-prefs POST]", err);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await unlinkLine(session.user.email);
  const prefs = await getNotificationPrefs(session.user.email);
  return NextResponse.json(prefs);
}
