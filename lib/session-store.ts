// In-memory store mapping sessionId → { spreadsheetId, accessToken }
// Also indexes OTP → sessionId for manual check-in mode.
// Populated when a teacher opens a session. Works for single-process deployments.

const store = new Map<string, { spreadsheetId: string; accessToken: string }>();
const otpIndex = new Map<string, string>(); // OTP → sessionId

export function registerSession(
  sessionId: string,
  spreadsheetId: string,
  accessToken: string,
  otp?: string
): void {
  store.set(sessionId, { spreadsheetId, accessToken });
  if (otp) otpIndex.set(otp, sessionId);
}

export function lookupSession(
  sessionId: string
): { spreadsheetId: string; accessToken: string } | undefined {
  return store.get(sessionId);
}

export function lookupByOTP(
  otp: string
): { sessionId: string; spreadsheetId: string; accessToken: string } | undefined {
  const sessionId = otpIndex.get(otp);
  if (!sessionId) return undefined;
  const data = store.get(sessionId);
  if (!data) return undefined;
  return { sessionId, ...data };
}
