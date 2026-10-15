import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function presentedSecret(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return headers.get("x-api-key")?.trim() || null;
}

/**
 * Authorizes internal server-to-server calls and Vercel Cron invocations.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; internal callers may
 * use the same bearer header or `x-api-key`. Comparison is constant-time.
 * Fails closed when CRON_SECRET is not configured.
 */
export function isAuthorizedInternalRequest(headers: Headers): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const presented = presentedSecret(headers);
  if (!presented) return false;
  return safeEqual(presented, expected);
}
