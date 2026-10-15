import { describe, expect, it } from "vitest";

import { checkIdentity, computeUserHash, verifyUserHash } from "@/lib/widget-identity";

const secret = "supo_idv_test";

describe("verifyUserHash", () => {
  it("accepts the HMAC of the subject and rejects anything else", () => {
    const hash = computeUserHash(secret, "user_42");
    expect(verifyUserHash(secret, "user_42", hash)).toBe(true);
    expect(verifyUserHash(secret, "user_42", hash.toUpperCase())).toBe(true);
    expect(verifyUserHash(secret, "user_43", hash)).toBe(false);
    expect(verifyUserHash("other", "user_42", hash)).toBe(false);
    expect(verifyUserHash(secret, "user_42", "abc")).toBe(false);
    expect(verifyUserHash(secret, "user_42", undefined)).toBe(false);
    expect(verifyUserHash(null, "user_42", hash)).toBe(false);
  });
});

describe("checkIdentity", () => {
  const customer = { externalId: "user_42", email: "a@b.co" };

  it("is a no-op when verification is off", () => {
    expect(checkIdentity({ mode: "off", secret, customer, userHash: "x" })).toEqual({ ok: true, verified: false });
  });

  it("marks verified identities in optional mode without rejecting others", () => {
    expect(checkIdentity({ mode: "optional", secret, customer, userHash: computeUserHash(secret, "user_42") })).toEqual({
      ok: true,
      verified: true,
    });
    expect(checkIdentity({ mode: "optional", secret, customer, userHash: "nope" })).toEqual({ ok: true, verified: false });
  });

  it("rejects unverified identities in required mode and signs the email when there is no external id", () => {
    expect(checkIdentity({ mode: "required", secret, customer, userHash: "nope" }).ok).toBe(false);
    const emailOnly = { externalId: null, email: "a@b.co" };
    expect(
      checkIdentity({ mode: "required", secret, customer: emailOnly, userHash: computeUserHash(secret, "a@b.co") }),
    ).toEqual({ ok: true, verified: true });
  });
});
