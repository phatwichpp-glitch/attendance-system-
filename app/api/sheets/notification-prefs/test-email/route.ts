import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNotificationPrefs } from "@/lib/token-registry";
import { sendEmail, isEmailConfigured } from "@/lib/email-notify";

// Lets an admin verify their RESEND_API_KEY actually works from the Notifications
// page, without ever putting the key (or a test recipient) in source code.
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 400 });
  }

  const prefs = await getNotificationPrefs(session.user.email);
  try {
    await sendEmail(
      prefs.notify_email,
      "ทดสอบการแจ้งเตือน — ระบบเช็คชื่อ",
      "<p>นี่คืออีเมลทดสอบจากระบบเช็คชื่อ ถ้าคุณได้รับอีเมลนี้ แปลว่าตั้งค่า Resend สำเร็จแล้ว 🎉</p>"
    );
    return NextResponse.json({ success: true, sent_to: prefs.notify_email });
  } catch (err) {
    console.error("[test-email]", err);
    const detail = err instanceof Error ? err.message : "";
    // Resend without a verified domain can only deliver to the Resend account
    // owner's own address — the most common "works for me, fails for colleagues"
    // cause, so name it explicitly instead of a generic failure.
    const testingMode = /testing emails|verify a domain|own email/i.test(detail);
    return NextResponse.json({
      error: testingMode
        ? "Resend ยังอยู่ในโหมดทดสอบ — ส่งได้เฉพาะอีเมลของเจ้าของบัญชี Resend เท่านั้น ต้อง verify domain ที่ resend.com/domains แล้วตั้ง NOTIFY_FROM_EMAIL เป็นอีเมลบน domain นั้น (หรือใช้แจ้งเตือนทาง LINE แทน)"
        : `ส่งไม่สำเร็จ: ${detail || "unknown error"}`,
    }, { status: 500 });
  }
}
