// Shared Upstash Redis client (REST — safe for serverless, no connection pooling).
// Env names differ by how the database was created: the Upstash console/classic
// integration injects UPSTASH_REDIS_REST_*, while the Vercel Marketplace storage
// integration injects KV_REST_API_* (legacy Vercel KV naming) — accept both.
// When absent, getRedis() returns null and each store falls back to its original
// in-process/file implementation, so local dev keeps working with zero setup.

import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export function isRedisConfigured(): boolean {
  return getRedis() !== null;
}
