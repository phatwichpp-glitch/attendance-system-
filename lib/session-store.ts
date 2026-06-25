// In-memory store mapping sessionId → { spreadsheetId, accessToken }
// Populated when a teacher opens a session. Works for single-process deployments.
const store = new Map<string, { spreadsheetId: string; accessToken: string }>();

export function registerSession(
  sessionId: string,
  spreadsheetId: string,
  accessToken: string
): void {
  store.set(sessionId, { spreadsheetId, accessToken });
}

export function lookupSession(
  sessionId: string
): { spreadsheetId: string; accessToken: string } | undefined {
  return store.get(sessionId);
}
