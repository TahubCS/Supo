import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAppJwt, verifyWebhookSignature } from "@/lib/github/app";

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
