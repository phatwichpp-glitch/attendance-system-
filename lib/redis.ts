// Shared Upstash Redis client (REST — safe for serverless, no connection pooling).
// Configured via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (the names the
// Vercel Marketplace integration injects). When absent, getRedis() returns null and
// each store falls back to its original in-process/file implementation, so local dev
// keeps working with zero setup.

import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export function isRedisConfigured(): boolean {
  return getRedis() !== null;
}
