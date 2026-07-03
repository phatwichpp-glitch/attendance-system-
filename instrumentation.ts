export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // On Vercel (serverless) an in-process interval can't survive between invocations —
  // there the tick is driven by an external cron hitting /api/cron/tick instead.
  if (!process.env.VERCEL) {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
    return;
  }

  // On Vercel, session-store/token-registry/line-link-store silently fall back to
  // in-process memory or the (read-only) filesystem when Redis isn't configured —
  // neither works across serverless instances, and nothing else surfaces this.
  // Log loudly at cold start; app/admin/StorageHealthBanner.tsx surfaces it in the UI too.
  const { isRedisConfigured } = await import("@/lib/redis");
  if (!isRedisConfigured()) {
    console.error(
      "[startup] UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_*) are not set on Vercel — " +
      "session-store, token-registry, and line-link-store will fall back to per-instance " +
      "memory/filesystem, which breaks across serverless instances. Set the Redis env vars " +
      "and redeploy."
    );
  }
}
