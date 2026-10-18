import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// Signed `state` for third-party connect round trips (GitHub App, Atlassian).
// It ties the callback to the Supo user and product that started it, is valid
// for one provider only, and expires quickly.

const STATE_TTL_MS = 30 * 60 * 1000;

export type ConnectProvider = "github" | "atlassian";

export type ConnectState = { productId: string; userId: string; expiresAt: number };

function sign(data: string, secret: string, provider: ConnectProvider): string {
  return createHmac("sha256", `${secret}:${provider}-connect-state`).update(data).digest("base64url");
}

export function createConnectState(
  provider: ConnectProvider,
  productId: string,
  userId: string,
  { secret = env.BETTER_AUTH_SECRET, nowMs = Date.now() } = {},
): string {
  const data = Buffer.from(
    JSON.stringify({ p: productId, u: userId, e: nowMs + STATE_TTL_MS, n: crypto.randomUUID() }),
  ).toString("base64url");
  return `${data}.${sign(data, secret, provider)}`;
}

export function verifyConnectState(
  provider: ConnectProvider,
  state: string,
  { secret = env.BETTER_AUTH_SECRET, nowMs = Date.now() } = {},
): ConnectState | null {
  const [data, signature, extra] = state.split(".");
  if (!data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret, provider));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { p?: unknown; u?: unknown; e?: unknown };
    if (typeof parsed.p !== "string" || typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < nowMs) return null;
    return { productId: parsed.p, userId: parsed.u, expiresAt: parsed.e };
  } catch {
    return null;
  }
}
