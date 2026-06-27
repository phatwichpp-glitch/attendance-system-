import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
          ].join(" "),
          access_type: "offline",
          // prompt:"consent" จำเป็นเพื่อให้ Google ส่ง refresh_token กลับมาทุกครั้ง
          // ถ้าเอาออก → login ครั้งต่อไปจะไม่มี refresh_token → Sheets API error หลัง 1 ชั่วโมง
          // ด้วย session 6 เดือน + auto-refresh ข้างล่าง → เห็น consent screen แค่ปีละ ~2 ครั้ง
          prompt: "consent",
        },
      },
    }),
  ],

  session: {
    maxAge: 60 * 60 * 24 * 180, // session อยู่ได้ 6 เดือน (ไม่ต้อง re-login บ่อย)
  },

  callbacks: {
    async jwt({ token, account }) {
      // ── Login ครั้งแรก: เก็บ token ทั้งหมด ────────────────────────────────
      if (account) {
        return {
          ...token,
          access_token:  account.access_token,
          refresh_token: account.refresh_token,
          expires_at:    account.expires_at,   // unix seconds
        };
      }

      // ── Access token ยังใช้ได้ (60s buffer) ─────────────────────────────────
      if (Date.now() < (token.expires_at as number) * 1000 - 60_000) {
        return token;
      }

      // ── Access token หมดอายุ: refresh อัตโนมัติ ────────────────────────────
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:     process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type:    "refresh_token",
            refresh_token: token.refresh_token as string,
          }),
        });
        const refreshed = await res.json();
        if (!res.ok) throw refreshed;

        return {
          ...token,
          access_token:  refreshed.access_token,
          expires_at:    Math.floor(Date.now() / 1000) + (refreshed.expires_in as number),
          // Google ไม่ส่ง refresh_token ใหม่เสมอ — เก็บอันเดิมไว้ถ้าไม่มีอันใหม่
          refresh_token: refreshed.refresh_token ?? token.refresh_token,
        };
      } catch {
        // Refresh ล้มเหลว (revoked / expired) → บังคับ re-login ครั้งต่อไป
        return { ...token, error: "RefreshTokenError" as const };
      }
    },

    async session({ session, token }) {
      session.access_token  = token.access_token  as string;
      session.refresh_token = token.refresh_token as string;
      if ((token as { error?: string }).error) {
        (session as { error?: string }).error = (token as { error?: string }).error;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});

declare module "next-auth" {
  interface Session {
    access_token:  string;
    refresh_token: string;
    error?: string;
  }
}
