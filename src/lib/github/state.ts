import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// Signed `state` for the GitHub App install/authorize round trip. It ties the
// callback to the Supo user and product that started it and expires quickly.

const STATE_TTL_MS = 30 * 60 * 1000;

export type GitHubConnectState = { productId: string; userId: string; expiresAt: number };

function sign(data: string, secret: string): string {
  return createHmac("sha256", `${secret}:github-connect-state`).update(data).digest("base64url");
}

export function createConnectState(
  productId: string,
  userId: string,
  { secret = env.BETTER_AUTH_SECRET, nowMs = Date.now() } = {},
): string {
  const data = Buffer.from(
    JSON.stringify({ p: productId, u: userId, e: nowMs + STATE_TTL_MS, n: crypto.randomUUID() }),
  ).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function verifyConnectState(
  state: string,
  { secret = env.BETTER_AUTH_SECRET, nowMs = Date.now() } = {},
): GitHubConnectState | null {
  const [data, signature, extra] = state.split(".");
  if (!data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
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
