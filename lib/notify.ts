// Fires teacher notifications (email/LINE) when the scheduler auto-opens a session.
// Best-effort only — a notification failure must never affect the already-created
// session, so every send here is wrapped and logged rather than thrown.

import { getNotifyTargets } from "@/lib/token-registry";
import { sendEmail, isEmailConfigured } from "@/lib/email-notify";
import { sendLineMessage, isLineConfigured } from "@/lib/line-notify";

export async function notifyAdminOnOpen(email: string, subject: string, message: string): Promise<void> {
  const targets = await getNotifyTargets(email);

  if (targets.notify_email && isEmailConfigured()) {
    try {
      const html = `<pre style="font-family: inherit; white-space: pre-wrap; font-size: 14px;">${escapeHtml(message)}</pre>`;
      await sendEmail(targets.notify_email, subject, html);
    } catch (e) {
      console.error("[notify] email send failed", e);
    }
  }

  if (targets.line_user_id && isLineConfigured()) {
    try {
      await sendLineMessage(targets.line_user_id, message);
    } catch (e) {
      console.error("[notify] line send failed", e);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
