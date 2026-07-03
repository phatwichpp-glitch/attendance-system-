// Delays the auto-open LINE/email notification until a few minutes after the
// session actually opens, instead of firing the instant the scheduler's tick
// catches the open window. Same dual-backend shape as token-registry.ts:
//   - Upstash Redis (hash `attendance:pending-notify`, field = session_id)
//     when configured — required for this to survive across Vercel invocations.
//   - In-process Map otherwise (local dev / single-process hosts).
//
// One entry per session; the scheduler tick drains whatever is due each minute.

import { getRedis } from "@/lib/redis";

const REDIS_KEY = "attendance:pending-notify";

export interface PendingNotify {
  email: string;
  subject: string;
  message: string;
  dueAtMs: number;
}

const inProcessQueue = new Map<string, PendingNotify>();

export async function schedulePendingNotify(
  sessionId: string,
  entry: PendingNotify
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.hset(REDIS_KEY, { [sessionId]: JSON.stringify(entry) });
    return;
  }
  inProcessQueue.set(sessionId, entry);
}

/** Removes and returns every entry whose dueAtMs has already passed. */
export async function drainDuePendingNotifies(): Promise<
  Array<{ sessionId: string } & PendingNotify>
> {
  const now = Date.now();
  const due: Array<{ sessionId: string } & PendingNotify> = [];

  const redis = getRedis();
  if (redis) {
    const all = (await redis.hgetall<Record<string, string>>(REDIS_KEY)) ?? {};
    for (const [sessionId, raw] of Object.entries(all)) {
      let entry: PendingNotify | null = null;
      try {
        entry = JSON.parse(raw) as PendingNotify;
      } catch {
        // corrupt entry — drop it below rather than retry it forever
      }
      if (!entry || entry.dueAtMs <= now) {
        await redis.hdel(REDIS_KEY, sessionId);
        if (entry) due.push({ sessionId, ...entry });
      }
    }
    return due;
  }

  for (const [sessionId, entry] of inProcessQueue) {
    if (entry.dueAtMs <= now) {
      due.push({ sessionId, ...entry });
      inProcessQueue.delete(sessionId);
    }
  }
  return due;
}
