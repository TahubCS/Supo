import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { API_SCOPES, type ApiScope } from "./scopes";

export { API_SCOPE_LABELS, API_SCOPES, type ApiScope } from "./scopes";

const KEY_PREFIX = "supo_sk_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomToken(length: number): string {
  // Rejection sampling keeps the distribution uniform over the alphabet.
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** A new secret key, its display prefix and its hash. Only the hash is stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomToken(40)}`;
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && /^[A-Za-z0-9_]{20,100}$/.test(value);
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Extracts the key from `Authorization: Bearer <key>` (or `X-Api-Key`). */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const bearer = auth && /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1]?.trim();
  const value = bearer || headers.get("x-api-key")?.trim() || null;
  return value && looksLikeApiKey(value) ? value : null;
}

export function normalizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((s): s is ApiScope => API_SCOPES.includes(s as ApiScope)))];
}

/** `x:write` implies `x:read`. */
export function hasScope(granted: readonly string[], required: ApiScope): boolean {
  if (granted.includes(required)) return true;
  const [resource, level] = required.split(":");
  return level === "read" && granted.includes(`${resource}:write`);
}
