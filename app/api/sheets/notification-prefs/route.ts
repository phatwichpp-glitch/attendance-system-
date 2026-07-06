import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNotificationPrefs, setNotificationPrefs, setResendApiKey, unlinkLine } from "@/lib/token-registry";
import { isLineConfigured } from "@/lib/line-notify";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await getNotificationPrefs(session.user.email);
  return NextResponse.json({
    ...prefs,
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

    // resend_api_key: a non-empty string saves/replaces the admin's own key; an
    // empty string clears it (also turns email_notify off, see setResendApiKey).
    if (typeof body.resend_api_key === "string") {
      const trimmed = body.resend_api_key.trim();
      if (trimmed && !/^re_/.test(trimmed)) {
        return NextResponse.json({ error: "invalid_resend_key" }, { status: 400 });
      }
      await setResendApiKey(session.user.email, trimmed || null);
    }

    if (body.email_notify === true) {
      const prefsNow = await getNotificationPrefs(session.user.email);
      const willHaveKey = prefsNow.resend_configured || (typeof body.resend_api_key === "string" && body.resend_api_key.trim());
      if (!willHaveKey) {
        return NextResponse.json({ error: "resend_key_required" }, { status: 400 });
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
