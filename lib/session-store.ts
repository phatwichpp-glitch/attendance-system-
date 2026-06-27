// In-memory store mapping sessionId → { spreadsheetId, accessToken, expiresAt }
// Also indexes OTP → sessionId for manual check-in mode.
// Populated when a teacher opens a session. Works for single-process deployments.
//
// NOTE: This is intentionally in-process. Multi-instance deployments (e.g. Vercel
// serverless) must replace this with a shared store (Redis / KV). Sessions expire
// after SESSION_TTL_MS to prevent unbounded memory growth and stale token retention.

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface Entry {
  spreadsheetId: string;
  accessToken: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();
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

export function registerSession(
  sessionId: string,
  spreadsheetId: string,
  accessToken: string,
  otp?: string
): void {
  evictExpired();
  store.set(sessionId, { spreadsheetId, accessToken, expiresAt: Date.now() + SESSION_TTL_MS });
  if (otp) otpIndex.set(otp, sessionId);
}

export function lookupSession(
  sessionId: string
): { spreadsheetId: string; accessToken: string } | undefined {
  const entry = store.get(sessionId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(sessionId);
    return undefined;
  }
  return { spreadsheetId: entry.spreadsheetId, accessToken: entry.accessToken };
}

export function lookupByOTP(
  otp: string
): { sessionId: string; spreadsheetId: string; accessToken: string } | undefined {
  const sessionId = otpIndex.get(otp);
  if (!sessionId) return undefined;
  const data = lookupSession(sessionId);
  if (!data) return undefined;
  return { sessionId, ...data };
}
