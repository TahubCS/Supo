import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Identity verification for the widget (same model as Intercom/Crisp):
// the customer's backend signs the user's stable id with a per-product secret
// and passes `customer.userHash` to the widget. Verified identities may resume
// conversations and update profile fields; unverified ones may not.

export type IdentityVerificationMode = "off" | "optional" | "required";

export function normalizeIdentityMode(value: string | null | undefined): IdentityVerificationMode {
  return value === "optional" || value === "required" ? value : "off";
}

export function generateIdentitySecret(): string {
  return `supo_idv_${randomBytes(32).toString("hex")}`;
}

/** The value that gets signed: the external id when present, otherwise the email. */
export function identitySubject(customer: { externalId: string | null; email: string | null }): string | null {
  return customer.externalId ?? customer.email ?? null;
}

export function computeUserHash(secret: string, subject: string): string {
  return createHmac("sha256", secret).update(subject).digest("hex");
}

export function verifyUserHash(secret: string | null | undefined, subject: string | null, userHash: unknown): boolean {
  if (!secret || !subject || typeof userHash !== "string") return false;
  const presented = userHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(presented)) return false;
  const expected = computeUserHash(secret, subject);
  return timingSafeEqual(Buffer.from(presented, "hex"), Buffer.from(expected, "hex"));
}

export type IdentityCheck =
  | { ok: true; verified: boolean }
  | { ok: false; error: string };

export function checkIdentity({
  mode,
  secret,
  customer,
  userHash,
}: {
  mode: IdentityVerificationMode;
  secret: string | null | undefined;
  customer: { externalId: string | null; email: string | null };
  userHash: unknown;
}): IdentityCheck {
  if (mode === "off" || !secret) return { ok: true, verified: false };
  const verified = verifyUserHash(secret, identitySubject(customer), userHash);
  if (mode === "required" && !verified) {
    return { ok: false, error: "Identity verification failed" };
  }
  return { ok: true, verified };
}
