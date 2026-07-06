import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminTokenStatus } from "@/lib/token-registry";
import { getSchedulerStatus } from "@/lib/scheduler-health";

// Deliberately does not require session.access_token like every other /api/sheets/*
// route — this must keep working in exactly the scenario it's designed to detect
// (the scheduler's stored refresh_token has died), so it only needs the session's email.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getAdminTokenStatus(session.user.email);
  // schedulerStale is global (not per-admin) — true when the tick hasn't run
  // recently at all, e.g. CRON_SECRET missing or the external cron never set up.
  const { stale: schedulerStale } = await getSchedulerStatus();
  return NextResponse.json({ status, schedulerStale });
}
