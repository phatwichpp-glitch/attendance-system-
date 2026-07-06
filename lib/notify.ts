// Fires teacher notifications (email/LINE) when the scheduler auto-opens a session.
// Best-effort only — a notification failure must never affect the already-created
// session, so every send here is wrapped and logged rather than thrown.

import { getNotifyTargets, recordNotifyResult } from "@/lib/token-registry";
import { sendEmail } from "@/lib/email-notify";
import { sendLineMessage, isLineConfigured } from "@/lib/line-notify";

export async function notifyAdminOnOpen(email: string, subject: string, message: string): Promise<void> {
  const targets = await getNotifyTargets(email);
  const errors: string[] = [];

  if (targets.notify_email && targets.resend_api_key) {
    try {
      const html = `<pre style="font-family: inherit; white-space: pre-wrap; font-size: 14px;">${escapeHtml(message)}</pre>`;
      await sendEmail(targets.resend_api_key, targets.notify_email, subject, html);
    } catch (e) {
      console.error("[notify] email send failed", e);
      errors.push(`Email: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (targets.line_user_id && isLineConfigured()) {
    try {
      await sendLineMessage(targets.line_user_id, message);
    } catch (e) {
      console.error("[notify] line send failed", e);
      errors.push(`LINE: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Only record an outcome if at least one channel was actually attempted —
  // an admin with both channels off shouldn't show a stale/misleading result.
  if (targets.notify_email || targets.line_user_id) {
    try {
      await recordNotifyResult(email, errors.length > 0 ? errors.join(" / ") : null);
    } catch (e) {
      console.error("[notify] failed to record notify result", e);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
