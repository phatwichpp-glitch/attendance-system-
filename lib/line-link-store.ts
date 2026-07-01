// In-memory store for LINE account-linking codes. A teacher generates a short code in
// /admin/notifications, sends it as a LINE message to the shared Official Account, and
// the webhook (app/api/line/webhook/route.ts) exchanges it for their LINE userId.
// Mirrors the in-process Map pattern in lib/session-store.ts — single-process only.

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface Entry {
  email: string;
  expiresAt: number;
}

const codes = new Map<string, Entry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(code);
  }
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateLinkCode(email: string): string {
  evictExpired();
  const code = randomCode();
  codes.set(code, { email: email.trim().toLowerCase(), expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

/** Single-use: consuming a code removes it. Returns the associated email, or undefined if unknown/expired. */
export function consumeLinkCode(code: string): string | undefined {
  evictExpired();
  const entry = codes.get(code.trim().toUpperCase());
  if (!entry) return undefined;
  codes.delete(code.trim().toUpperCase());
  return entry.email;
}
