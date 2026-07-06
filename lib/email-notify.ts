// Email delivery via Resend (resend.com) — thin wrapper so the rest of the app never
// imports the SDK directly.
//
// Bring-your-own-account model: each admin registers their own free Resend account
// and pastes their own API key into /admin/notifications (lib/token-registry.ts
// stores it sealed, per-admin). A single shared account was tried first and turned
// off 2026-07-03 — without a verified custom domain, Resend can only deliver to the
// account owner's own address, so one shared account could only ever email the
// developer, never an actual teacher. That exact restriction is a non-issue here:
// each admin's notifications are addressed to themselves, i.e. the same address
// their own Resend account is registered under, so no domain purchase is needed.
//
// Sender is always Resend's own shared testing address — a per-admin free account
// can't verify a custom "from" domain, so there's no meaningful per-admin override.
const FROM_ADDRESS = "onboarding@resend.dev";

import { Resend } from "resend";

export async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void> {
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
