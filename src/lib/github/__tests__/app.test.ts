import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAppJwt, verifyWebhookSignature } from "@/lib/github/app";
import { createConnectState, verifyConnectState } from "@/lib/github/state";

describe("createAppJwt", () => {
  it("creates an RS256 JWT GitHub accepts (backdated, under 10 minutes)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = Date.UTC(2026, 0, 1);

    const [header, payload, signature] = createAppJwt("12345", pem, now).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("12345");
    expect(claims.iat).toBe(now / 1000 - 60);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);

    const valid = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    expect(valid).toBe(true);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ action: "opened" });
  const sign = (payload: string, key = secret) =>
    `sha256=${createHmac("sha256", key).update(payload).digest("hex")}`;

  it("accepts the HMAC of the raw body", () => {
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true);
  });

  it("rejects missing, malformed, tampered or wrongly keyed signatures", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sign(body), secret)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, "other"), secret)).toBe(false);
  });
});

describe("connect state", () => {
  const secret = "state-secret";

  it("round-trips the product and user", () => {
    const state = createConnectState("prod_1", "user_1", { secret, nowMs: 1_000 });
    expect(verifyConnectState(state, { secret, nowMs: 2_000 })).toMatchObject({ productId: "prod_1", userId: "user_1" });
  });

  it("rejects tampered, foreign or expired state", () => {
    const state = createConnectState("prod_1", "user_1", { secret, nowMs: 1_000 });
    const [data, signature] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString()), p: "prod_2" }),
    ).toString("base64url");

    expect(verifyConnectState(`${forged}.${signature}`, { secret, nowMs: 2_000 })).toBeNull();
    expect(verifyConnectState(state, { secret: "other", nowMs: 2_000 })).toBeNull();
    expect(verifyConnectState(state, { secret, nowMs: 1_000 + 31 * 60 * 1000 })).toBeNull();
    expect(verifyConnectState("garbage", { secret })).toBeNull();
  });
});
