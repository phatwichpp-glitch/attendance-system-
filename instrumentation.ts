export async function register() {
  // On Vercel (serverless) an in-process interval can't survive between invocations —
  // there the tick is driven by an external cron hitting /api/cron/tick instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
