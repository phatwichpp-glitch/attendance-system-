// Tracks the last time the scheduler tick actually executed, so the admin UI can
// detect a dead/misconfigured cron on Vercel (e.g. CRON_SECRET unset, or the
// external cron itself never configured) or a stalled in-process interval locally.
// Previously nothing surfaced this at all — auto-open could silently never run
// for an entire semester with no signal anywhere.

import { getRedis } from "@/lib/redis";

const LAST_TICK_KEY = "attendance:last-tick";
const STALE_AFTER_MS = 3 * 60_000; // the tick is expected every 1 minute

let memoryLastTick: number | null = null;

export async function recordTick(): Promise<void> {
  const now = Date.now();
  const redis = getRedis();
  if (redis) {
    await redis.set(LAST_TICK_KEY, now);
    return;
  }
  memoryLastTick = now;
}

export async function getSchedulerStatus(): Promise<{ lastTickAt: number | null; stale: boolean }> {
  const redis = getRedis();
  const lastTickAt = redis ? await redis.get<number>(LAST_TICK_KEY) : memoryLastTick;
  return { lastTickAt: lastTickAt ?? null, stale: !lastTickAt || Date.now() - lastTickAt > STALE_AFTER_MS };
}
