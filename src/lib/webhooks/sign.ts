import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signature scheme (same shape as Stripe's):
//   Supo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// Receivers should reject timestamps older than a few minutes.

export const SIGNATURE_HEADER = "Supo-Signature";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Verifies a signature header against the raw request body. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null,
  { toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now = Date.now() } = {},
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}
