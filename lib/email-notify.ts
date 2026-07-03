// Email delivery via Resend (resend.com) — thin wrapper so the rest of the app never
// imports the SDK directly. No-ops if RESEND_API_KEY isn't configured, so the feature
// degrades gracefully when the developer hasn't set up an account yet.

import { Resend } from "resend";

// Turned off at the user's request (2026-07-03): without a verified custom
// domain, Resend can only deliver to the account owner's own address, and
// buying a domain just to unlock email wasn't worth it. This is the single
// switch — flip back to `!!process.env.RESEND_API_KEY` if a domain gets
// sorted out later. LINE notifications are unaffected and keep working.
const EMAIL_DISABLED = true;

export function isEmailConfigured(): boolean {
  return !EMAIL_DISABLED && !!process.env.RESEND_API_KEY;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email-notify] RESEND_API_KEY not set — skipping email");
    return;
  }

  const resend = new Resend(apiKey);
  const email = process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev";
  // If NOTIFY_FROM_NAME is set, format as "Name <email>"; otherwise just email.
  const from = process.env.NOTIFY_FROM_NAME ? `${process.env.NOTIFY_FROM_NAME} <${email}>` : email;

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
