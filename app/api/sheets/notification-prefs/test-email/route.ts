import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNotificationPrefs, getResendApiKey } from "@/lib/token-registry";
import { sendEmail } from "@/lib/email-notify";

// Lets an admin verify their own Resend API key actually works from the
// Notifications page, without ever putting the key (or a test recipient) in
// source code.
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await getResendApiKey(session.user.email);
  if (!apiKey) {
    return NextResponse.json({ error: "resend_key_required" }, { status: 400 });
  }

  const prefs = await getNotificationPrefs(session.user.email);
  try {
    await sendEmail(
      apiKey,
      prefs.notify_email,
      "ทดสอบการแจ้งเตือน — ระบบเช็คชื่อ",
      "<p>นี่คืออีเมลทดสอบจากระบบเช็คชื่อ ถ้าคุณได้รับอีเมลนี้ แปลว่าตั้งค่า Resend สำเร็จแล้ว 🎉</p>"
    );
    return NextResponse.json({ success: true, sent_to: prefs.notify_email });
  } catch (err) {
    console.error("[test-email]", err);
    const detail = err instanceof Error ? err.message : "";
    // A free Resend account without a verified domain can only deliver to the
    // account owner's own address — the most likely failure here, since it's
    // easy to set "ส่งไปที่อีเมล" to something other than the address used to
    // sign up for Resend. Name it explicitly instead of a generic failure.
    const testingMode = /testing emails|verify a domain|own email/i.test(detail);
    return NextResponse.json({
      error: testingMode
        ? "Resend อนุญาตให้ส่งได้เฉพาะอีเมลที่ใช้สมัครบัญชี Resend เท่านั้น (ยังไม่ได้ verify domain) — ตรวจสอบว่าช่อง \"ส่งไปที่อีเมล\" ตรงกับอีเมลที่ใช้สมัคร Resend ของคุณ"
        : `ส่งไม่สำเร็จ: ${detail || "unknown error"}`,
    }, { status: 500 });
  }
}
