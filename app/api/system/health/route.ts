import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isRedisConfigured } from "@/lib/redis";

// Surfaces whether the Redis-backed stores (session-store, token-registry,
// line-link-store) are actually usable in this deployment. On Vercel, missing
// Redis env vars used to fail silently: each store falls back to in-process
// memory/filesystem, which doesn't work across serverless instances but throws
// no error anywhere — check-ins would just intermittently 404 with no signal
// to the admin. This route lets the admin UI warn instead of staying silent.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isVercel = !!process.env.VERCEL;
  const redisConfigured = isRedisConfigured();
  return NextResponse.json({
    isVercel,
    redisConfigured,
    storageOk: !isVercel || redisConfigured,
  });
}
