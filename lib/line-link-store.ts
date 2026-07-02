// Store for LINE account-linking codes. A teacher generates a short code in
// /admin/notifications, sends it as a LINE message to the shared Official Account, and
// the webhook (app/api/line/webhook/route.ts) exchanges it for their LINE userId.
//
// Uses Upstash Redis when configured (required on Vercel — the webhook request rarely
// lands on the instance that generated the code), falling back to an in-process Map
// for local dev. Codes are single-use and expire after 15 minutes.

import { getRedis } from "@/lib/redis";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CODE_TTL_S = CODE_TTL_MS / 1000;

const codeKey = (code: string) => `attendance:linkcode:${code}`;

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

export async function generateLinkCode(email: string): Promise<string> {
  const code = randomCode();
  const normalized = email.trim().toLowerCase();

  const redis = getRedis();
  if (redis) {
    await redis.set(codeKey(code), normalized, { ex: CODE_TTL_S });
    return code;
  }

  evictExpired();
  codes.set(code, { email: normalized, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

/** Single-use: consuming a code removes it. Returns the associated email, or undefined if unknown/expired. */
export async function consumeLinkCode(code: string): Promise<string | undefined> {
  const normalized = code.trim().toUpperCase();

  const redis = getRedis();
  if (redis) {
    // GETDEL: atomic read-and-remove, so a code can never be redeemed twice.
    const email = await redis.getdel<string>(codeKey(normalized));
    return email ?? undefined;
  }

  evictExpired();
  const entry = codes.get(normalized);
  if (!entry) return undefined;
  codes.delete(normalized);
  return entry.email;
}
