import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { integrationsEncryptionKey, openSecret, sealSecret } from "@/lib/crypto/secret-box";

const key = randomBytes(32);

function tamper(sealed: string, index: number): string {
  const parts = sealed.split(".");
  const bytes = Buffer.from(parts[index], "base64url");
  bytes[0] ^= 0x01;
  parts[index] = bytes.toString("base64url");
  return parts.join(".");
}

describe("sealSecret / openSecret", () => {
  it("round-trips a value", () => {
    const sealed = sealSecret("refresh-token-123", "atlassian:refresh", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("refresh-token-123");
    expect(openSecret(sealed, "atlassian:refresh", key)).toBe("refresh-token-123");
  });

  it("uses a fresh IV for every seal", () => {
    expect(sealSecret("same", "ctx", key)).not.toBe(sealSecret("same", "ctx", key));
  });

  it("rejects the wrong key or the wrong context", () => {
    const sealed = sealSecret("secret", "atlassian:refresh", key);
    expect(() => openSecret(sealed, "atlassian:refresh", randomBytes(32))).toThrow();
    expect(() => openSecret(sealed, "atlassian:access", key)).toThrow();
  });

  it("rejects a tampered IV, tag or ciphertext", () => {
    const sealed = sealSecret("secret", "ctx", key);
    for (const index of [1, 2, 3]) {
      expect(() => openSecret(tamper(sealed, index), "ctx", key)).toThrow();
    }
  });

  it("rejects a truncated authentication tag", () => {
    const parts = sealSecret("secret", "ctx", key).split(".");
    parts[2] = Buffer.from(parts[2], "base64url").subarray(0, 4).toString("base64url");
    expect(() => openSecret(parts.join("."), "ctx", key)).toThrow();
  });

  it("rejects malformed values", () => {
    const sealed = sealSecret("secret", "ctx", key);
    expect(() => openSecret(sealed.replace(/^v1/, "v2"), "ctx", key)).toThrow("Unsupported secret format");
    expect(() => openSecret("v1.abc", "ctx", key)).toThrow("Unsupported secret format");
    expect(() => openSecret(`${sealed}.extra`, "ctx", key)).toThrow("Unsupported secret format");
  });
});

describe("integrationsEncryptionKey", () => {
  const original = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    else process.env.INTEGRATIONS_ENCRYPTION_KEY = original;
  });

  it("decodes a 32-byte base64 key", () => {
    const raw = randomBytes(32);
    process.env.INTEGRATIONS_ENCRYPTION_KEY = raw.toString("base64");
    expect(integrationsEncryptionKey().equals(raw)).toBe(true);
  });

  it("refuses a missing or wrongly sized key", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect(() => integrationsEncryptionKey()).toThrow("not set");
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => integrationsEncryptionKey()).toThrow("32 bytes");
  });
});
