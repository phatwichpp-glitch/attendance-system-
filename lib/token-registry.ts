// Local encrypted store for admin Google refresh_tokens, persisted server-side so the
// auto-open scheduler (lib/scheduler.ts) can mint fresh access tokens with no browser
// session in flight. Keyed by admin email — its keys also double as the registry of
// "which admins the scheduler knows about", since there's no other way to discover
// admins across separate per-user spreadsheets.
//
// Encrypted at rest (AES-256-GCM) with a key derived from NEXTAUTH_SECRET (no new
// secret). Writes are serialized through an in-process mutex and go through a
// temp-file + rename so a scheduler tick and a browser login can never race into a
// corrupt file.

import { promises as fs } from "fs";
import path from "path";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

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
}

interface RegistryFile {
  version: 1;
  admins: Record<string, AdminEntry>;
}

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to encrypt the token registry");
  return scryptSync(secret, "attendance-token-registry", 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function saveAdminRefreshToken(email: string, refreshToken: string): Promise<void> {
  const key = normalizeEmail(email);
  await withLock(async () => {
    const data = await readFile();
    data.admins[key] = {
      encrypted_refresh_token: encrypt(refreshToken),
      updated_at: new Date().toISOString(),
      status: "ok",
      last_error: null,
      last_error_at: null,
    };
    await writeFile(data);
  });
}

export async function getAdminRefreshToken(email: string): Promise<string | null> {
  const data = await readFile();
  const entry = data.admins[normalizeEmail(email)];
  if (!entry) return null;
  try {
    return decrypt(entry.encrypted_refresh_token);
  } catch {
    return null;
  }
}

export async function listKnownAdminEmails(): Promise<string[]> {
  const data = await readFile();
  return Object.keys(data.admins);
}

export async function markAdminTokenInvalid(email: string, errorMessage: string): Promise<void> {
  const key = normalizeEmail(email);
  await withLock(async () => {
    const data = await readFile();
    const entry = data.admins[key];
    if (!entry) return;
    entry.status = "invalid";
    entry.last_error = errorMessage;
    entry.last_error_at = new Date().toISOString();
    await writeFile(data);
  });
}

export async function markAdminTokenOk(email: string): Promise<void> {
  const key = normalizeEmail(email);
  await withLock(async () => {
    const data = await readFile();
    const entry = data.admins[key];
    if (!entry || entry.status === "ok") return;
    entry.status = "ok";
    entry.last_error = null;
    entry.last_error_at = null;
    await writeFile(data);
  });
}

export async function getAdminTokenStatus(email: string): Promise<TokenStatus | "unknown"> {
  const data = await readFile();
  const entry = data.admins[normalizeEmail(email)];
  return entry?.status ?? "unknown";
}
