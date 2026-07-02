import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runSchedulerTick } from "@/lib/scheduler";

// Serverless replacement for the in-process setInterval (which cannot survive on
// Vercel — see instrumentation.ts): an external cron (cron-job.org, or Vercel Cron
// on a paid plan) hits this route every minute. Public path in proxy.ts; auth is
// CRON_SECRET instead of a session, accepted as either
//   Authorization: Bearer <secret>   (what Vercel Cron sends automatically)
//   ?key=<secret>                    (easier to configure on cron-job.org)
// Duplicate/overlapping triggers are collapsed by the Redis lock inside
// runSchedulerTick, so an over-eager cron cannot double-open sessions.

export const maxDuration = 60; // seconds — a tick does several Sheets round-trips per admin

function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 503 }
    );
  }

  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("key") ??
    "";
  if (!secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSchedulerTick();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron] tick failed", e);
    return NextResponse.json({ ran: false, error: "tick failed" }, { status: 500 });
  }
}
