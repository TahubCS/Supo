import { describe, expect, it } from "vitest";

import { generateApiKey, hasScope, hashApiKey, normalizeScopes, readApiKey } from "@/lib/api/keys";
import { signWebhook, verifyWebhookSignature } from "@/lib/webhooks/sign";

describe("API keys", () => {
  it("generates unique keys whose hash, not value, is stored", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^supo_sk_[A-Za-z0-9]{40}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 14));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads keys from Authorization or X-Api-Key", () => {
    const { key } = generateApiKey();
    expect(readApiKey(new Headers({ authorization: `Bearer ${key}` }))).toBe(key);
    expect(readApiKey(new Headers({ "x-api-key": key }))).toBe(key);
    expect(readApiKey(new Headers({ authorization: "Bearer nope" }))).toBeNull();
    expect(readApiKey(new Headers())).toBeNull();
  });

  it("checks scopes, with write implying read", () => {
    expect(hasScope(["conversations:write"], "conversations:read")).toBe(true);
    expect(hasScope(["conversations:read"], "conversations:write")).toBe(false);
    expect(hasScope(["articles:read"], "knowledge:read")).toBe(false);
    expect(normalizeScopes(["articles:read", "bogus", "articles:read"])).toEqual(["articles:read"]);
    expect(normalizeScopes("articles:read")).toEqual([]);
  });
});

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "conversation.created" });

  it("round-trips", () => {
    const header = signWebhook(secret, body, 1_800_000_000);
    expect(verifyWebhookSignature(secret, body, header, { now: 1_800_000_000_000 })).toBe(true);
  });

  it("rejects tampering, wrong secrets and stale timestamps", () => {
    const header = signWebhook(secret, body, 1_800_000_000);
    expect(verifyWebhookSignature(secret, `${body} `, header, { now: 1_800_000_000_000 })).toBe(false);
    expect(verifyWebhookSignature("whsec_other", body, header, { now: 1_800_000_000_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, body, header, { now: 1_800_000_000_000 + 301_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, body, "t=1,v1=zz", { now: 1000 })).toBe(false);
    expect(verifyWebhookSignature(secret, body, null)).toBe(false);
  });
});
