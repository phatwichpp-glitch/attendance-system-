// Store mapping sessionId → { spreadsheetId, accessToken } so the public
// (unauthenticated) check-in endpoint can write to the teacher's spreadsheet.
// Also indexes OTP → sessionId for manual check-in mode. Populated when a teacher
// opens a session (and refreshed by the admin browser's polling).
//
// Two backends behind the same async API:
//   - Upstash Redis when configured (required on Vercel — serverless instances
//     don't share memory, so the instance that serves a student's check-in is
//     rarely the one where the session was registered). Entries carry a TTL and
//     the access token is sealed (AES-256-GCM) before leaving the process.
//   - In-process Map otherwise (local dev, single-process hosts).
//
// Entries expire after SESSION_TTL to prevent stale token retention.

import { getRedis } from "@/lib/redis";
import { sealSecret, openSecret } from "@/lib/secret-box";

const SESSION_TTL_S = 4 * 60 * 60; // 4 hours
const SESSION_TTL_MS = SESSION_TTL_S * 1000;

const sessionKey = (sessionId: string) => `attendance:session:${sessionId}`;
const otpKey = (otp: string) => `attendance:otp:${otp}`;

interface RedisEntry {
  spreadsheetId: string;
  sealedAccessToken: string;
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

interface MemEntry {
  spreadsheetId: string;
  accessToken: string;
  expiresAt: number;
}

const store = new Map<string, MemEntry>();
const otpIndex = new Map<string, string>(); // OTP → sessionId

function evictExpired(): void {
  const now = Date.now();
  for (const [sid, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(sid);
    }
  }
  for (const [otp, sid] of otpIndex) {
    if (!store.has(sid)) {
      otpIndex.delete(otp);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function registerSession(
  sessionId: string,
  spreadsheetId: string,
  accessToken: string,
  otp?: string
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const entry: RedisEntry = { spreadsheetId, sealedAccessToken: sealSecret(accessToken) };
    await redis.set(sessionKey(sessionId), entry, { ex: SESSION_TTL_S });
    if (otp) await redis.set(otpKey(otp), sessionId, { ex: SESSION_TTL_S });
    return;
  }

  evictExpired();
  store.set(sessionId, { spreadsheetId, accessToken, expiresAt: Date.now() + SESSION_TTL_MS });
  if (otp) otpIndex.set(otp, sessionId);
}

export async function lookupSession(
  sessionId: string
): Promise<{ spreadsheetId: string; accessToken: string } | undefined> {
  const redis = getRedis();
  if (redis) {
    const entry = await redis.get<RedisEntry>(sessionKey(sessionId));
    if (!entry) return undefined;
    try {
      return { spreadsheetId: entry.spreadsheetId, accessToken: openSecret(entry.sealedAccessToken) };
    } catch {
      return undefined; // NEXTAUTH_SECRET changed since the entry was written
    }
  }

  const entry = store.get(sessionId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(sessionId);
    return undefined;
  }
  return { spreadsheetId: entry.spreadsheetId, accessToken: entry.accessToken };
}

export async function lookupByOTP(
  otp: string
): Promise<{ sessionId: string; spreadsheetId: string; accessToken: string } | undefined> {
  const redis = getRedis();
  if (redis) {
    const sessionId = await redis.get<string>(otpKey(otp));
    if (!sessionId) return undefined;
    const data = await lookupSession(sessionId);
    if (!data) return undefined;
    return { sessionId, ...data };
  }

  const sessionId = otpIndex.get(otp);
  if (!sessionId) return undefined;
  const data = await lookupSession(sessionId);
  if (!data) return undefined;
  return { sessionId, ...data };
}
