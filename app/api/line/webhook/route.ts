import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { consumeLinkCode } from "@/lib/line-link-store";
import { linkLineUserId } from "@/lib/token-registry";
import { replyLineMessage } from "@/lib/line-notify";

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type: string; text?: string };
}

function isValidSignature(rawBody: string, signature: string, channelSecret: string): boolean {
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const sigBuf = Buffer.from(signature, "base64");
  const expBuf = Buffer.from(expected, "base64");
  return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
}

// Public route — LINE's servers can't carry our session cookie, so auth here is the
// HMAC signature instead (see proxy.ts's publicPaths). Always returns 200 once the
// signature check passes; LINE expects an ack regardless of whether the message text
// was a recognized linking code.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (channelSecret) {
    const signature = req.headers.get("x-line-signature") ?? "";
    if (!signature || !isValidSignature(rawBody, signature, channelSecret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let events: LineWebhookEvent[] = [];
  try {
    events = JSON.parse(rawBody).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    try {
      if (event.type !== "message" || event.message?.type !== "text" || !event.source?.userId) continue;

      const code = event.message.text?.trim() ?? "";
      const email = consumeLinkCode(code);

      if (email) {
        await linkLineUserId(email, event.source.userId);
        if (event.replyToken) {
          await replyLineMessage(event.replyToken, `เชื่อมต่อบัญชี LINE กับ ${email} เรียบร้อยแล้ว ✓`);
        }
      } else if (event.replyToken) {
        await replyLineMessage(event.replyToken, "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จากหน้าตั้งค่าแจ้งเตือนในระบบ");
      }
    } catch (e) {
      console.error("[line-webhook] event handling failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
