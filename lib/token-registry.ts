// Store for admin Google refresh_tokens, persisted server-side so the auto-open
// scheduler (lib/scheduler.ts) can mint fresh access tokens with no browser session
// in flight. Keyed by admin email — its keys also double as the registry of "which
// admins the scheduler knows about", since there's no other way to discover admins
// across separate per-user spreadsheets.
//
// Two backends behind the same async API:
//   - Upstash Redis (hash `attendance:admins`, field = email, value = entry JSON)
//     when UPSTASH_REDIS_REST_URL/TOKEN are set — required on Vercel, where the
//     filesystem is read-only/ephemeral and instances don't share memory.
//   - Local JSON file (data/admin-tokens.json) otherwise, for local dev with zero
//     setup. Writes are serialized through an in-process mutex and go through a
//     temp-file + rename so a scheduler tick and a browser login can never race
//     into a corrupt file.
//
// In both backends the refresh token itself is encrypted at rest (AES-256-GCM)
// with a key derived from NEXTAUTH_SECRET (no new secret).

import { promises as fs } from "fs";
import path from "path";
import { sealSecret, openSecret } from "@/lib/secret-box";
import { getRedis } from "@/lib/redis";

const REDIS_KEY = "attendance:admins";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "admin-tokens.json");
const TMP_PATH = `${FILE_PATH}.tmp`;

type TokenStatus = "ok" | "invalid";

interface AdminEntry {
  encrypted_refresh_token: string;
  updated_at: string;
  status: TokenStatus;
  last_error: string | null;
  last_error_at: string | null;
  // Auto-open notification prefs (Deliver the OTP feature)
  email_notify: boolean;
  notify_email: string | null; // destination address; null = use the Google login email
  line_notify: boolean;
  line_user_id: string | null;
  // Last auto-open notification send attempt — previously send failures were only
  // console.error-logged, invisible to the admin until they noticed no message arrived.
  last_notify_error?: string | null;
  last_notify_at?: string | null;
}

export interface NotificationPrefs {
  email_notify: boolean;
  notify_email: string; // resolved — always has a value (falls back to the login email)
  line_notify: boolean;
  line_linked: boolean;
  last_notify_error: string | null;
  last_notify_at: string | null;
}

interface RegistryFile {
  version: 1;
  admins: Record<string, AdminEntry>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── File backend (local dev fallback) ────────────────────────────────────────

async function readFile(): Promise<RegistryFile> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.admins) return parsed as RegistryFile;
    return { version: 1, admins: {} };
  } catch {
    return { version: 1, admins: {} };
  }
}

async function writeFile(data: RegistryFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TMP_PATH, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(TMP_PATH, FILE_PATH);
}

// Promise-chain mutex — serializes every read-modify-write cycle in this process.
let writeQueue: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// ─── Backend-dispatching entry access ─────────────────────────────────────────

async function loadEntry(emailKey: string): Promise<AdminEntry | null> {
  const redis = getRedis();
  if (redis) {
    return (await redis.hget<AdminEntry>(REDIS_KEY, emailKey)) ?? null;
  }
  const data = await readFile();
  return data.admins[emailKey] ?? null;
}

/**
 * Read-modify-write for one admin's entry. `mutate` returns the entry to store,
 * or null to leave the registry unchanged.
 * File backend: whole cycle runs inside the process mutex. Redis backend: the write
 * is field-scoped (HSET on this admin only), so concurrent updates to *different*
 * admins never collide; same-admin races are last-write-wins, same as before.
 */
async function updateEntry(
  emailKey: string,
  mutate: (existing: AdminEntry | null) => AdminEntry | null
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const next = mutate((await redis.hget<AdminEntry>(REDIS_KEY, emailKey)) ?? null);
    if (next) await redis.hset(REDIS_KEY, { [emailKey]: next });
    return;
  }
  await withLock(async () => {
    const data = await readFile();
    const next = mutate(data.admins[emailKey] ?? null);
    if (!next) return;
    data.admins[emailKey] = next;
    await writeFile(data);
  });
}

// ─── Public API (unchanged signatures) ────────────────────────────────────────

export async function saveAdminRefreshToken(email: string, refreshToken: string): Promise<void> {
  await updateEntry(normalizeEmail(email), (existing) => ({
    // Preserve notification prefs across token refreshes — this runs roughly
    // hourly while the admin is active, so it must never clobber them.
    email_notify: existing?.email_notify ?? true,
    notify_email: existing?.notify_email ?? null,
    line_notify: existing?.line_notify ?? false,
    line_user_id: existing?.line_user_id ?? null,
    last_notify_error: existing?.last_notify_error ?? null,
    last_notify_at: existing?.last_notify_at ?? null,
    encrypted_refresh_token: sealSecret(refreshToken),
    updated_at: new Date().toISOString(),
    status: "ok",
    last_error: null,
    last_error_at: null,
  }));
}

export async function getAdminRefreshToken(email: string): Promise<string | null> {
  const entry = await loadEntry(normalizeEmail(email));
  if (!entry) return null;
  try {
    return openSecret(entry.encrypted_refresh_token);
  } catch {
    return null;
  }
}

export async function listKnownAdminEmails(): Promise<string[]> {
  const redis = getRedis();
  if (redis) {
    return await redis.hkeys(REDIS_KEY);
  }
  const data = await readFile();
  return Object.keys(data.admins);
}

export async function markAdminTokenInvalid(email: string, errorMessage: string): Promise<void> {
  await updateEntry(normalizeEmail(email), (entry) => {
    if (!entry) return null;
    entry.status = "invalid";
    entry.last_error = errorMessage;
    entry.last_error_at = new Date().toISOString();
    return entry;
  });
}

export async function markAdminTokenOk(email: string): Promise<void> {
  await updateEntry(normalizeEmail(email), (entry) => {
    if (!entry || entry.status === "ok") return null;
    entry.status = "ok";
    entry.last_error = null;
    entry.last_error_at = null;
    return entry;
  });
}

export async function getAdminTokenStatus(email: string): Promise<TokenStatus | "unknown"> {
  const entry = await loadEntry(normalizeEmail(email));
  return entry?.status ?? "unknown";
}

export async function getNotificationPrefs(email: string): Promise<NotificationPrefs> {
  const key = normalizeEmail(email);
  const entry = await loadEntry(key);
  return {
    email_notify: entry?.email_notify ?? true,
    notify_email: entry?.notify_email || key,
    line_notify: entry?.line_notify ?? false,
    line_linked: !!entry?.line_user_id,
    last_notify_error: entry?.last_notify_error ?? null,
    last_notify_at: entry?.last_notify_at ?? null,
  };
}

/** Records the outcome of the most recent auto-open notification attempt, so a
 * silent email/LINE send failure (previously console.error-only) is visible to
 * the admin instead of just "no message arrived, for some reason". */
export async function recordNotifyResult(email: string, error: string | null): Promise<void> {
  await updateEntry(normalizeEmail(email), (entry) => {
    if (!entry) return null;
    entry.last_notify_error = error;
    entry.last_notify_at = new Date().toISOString();
    return entry;
  });
}

export async function setNotificationPrefs(
  email: string,
  prefs: { email_notify?: boolean; notify_email?: string | null; line_notify?: boolean }
): Promise<void> {
  const key = normalizeEmail(email);
  await updateEntry(key, (entry) => {
    if (!entry) return null; // admin must have logged in at least once (registers via saveAdminRefreshToken)
    if (prefs.email_notify !== undefined) entry.email_notify = prefs.email_notify;
    if (prefs.notify_email !== undefined) {
      const trimmed = prefs.notify_email?.trim();
      // Empty/omitted or equal to the login email → store null so it always tracks
      // the login email (e.g. if the admin later changes Google accounts).
      entry.notify_email = trimmed && normalizeEmail(trimmed) !== key ? trimmed : null;
    }
    if (prefs.line_notify !== undefined) entry.line_notify = prefs.line_notify && !!entry.line_user_id;
    return entry;
  });
}

export async function linkLineUserId(email: string, lineUserId: string): Promise<void> {
  await updateEntry(normalizeEmail(email), (entry) => {
    if (!entry) return null;
    entry.line_user_id = lineUserId;
    entry.line_notify = true;
    return entry;
  });
}

export async function unlinkLine(email: string): Promise<void> {
  await updateEntry(normalizeEmail(email), (entry) => {
    if (!entry) return null;
    entry.line_user_id = null;
    entry.line_notify = false;
    return entry;
  });
}

/** For the scheduler: resolve where (if anywhere) to send an auto-open notification. */
export async function getNotifyTargets(
  email: string
): Promise<{ notify_email: string | null; line_user_id: string | null }> {
  const key = normalizeEmail(email);
  const entry = await loadEntry(key);
  return {
    notify_email: entry?.email_notify ? (entry.notify_email || key) : null,
    line_user_id: entry?.line_notify ? entry.line_user_id ?? null : null,
  };
}
