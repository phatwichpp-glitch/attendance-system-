import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // /api/cron authenticates with CRON_SECRET instead of a session (external cron service)
  const publicPaths = ["/login", "/check", "/api/auth", "/api/sheets/checkin", "/api/line/webhook", "/api/cron"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // refresh_token หมดอายุหรือถูก revoke → บังคับ re-login
  if (isLoggedIn && (req.auth as { error?: string })?.error === "RefreshTokenError" && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
