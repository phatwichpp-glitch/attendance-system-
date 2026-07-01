// Shared Google OAuth access-token refresh — single source of truth used by both
// auth.ts (browser session refresh) and lib/scheduler.ts (background auto-open, which
// has no browser session and must mint its own access token from a stored refresh_token).

export interface RefreshedGoogleToken {
  access_token: string;
  expires_at: number; // unix seconds
  refresh_token: string;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<RefreshedGoogleToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const refreshed = await res.json();
  if (!res.ok) throw refreshed;

  return {
    access_token: refreshed.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in as number),
    // Google doesn't always send a new refresh_token — keep the old one if absent.
    refresh_token: refreshed.refresh_token ?? refreshToken,
  };
}
