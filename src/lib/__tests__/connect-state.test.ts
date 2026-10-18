import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createConnectState, verifyConnectState } from "@/lib/connect-state";

describe("connect state", () => {
  const secret = "state-secret";

  it("round-trips the product and user", () => {
    const state = createConnectState("github", "prod_1", "user_1", { secret, nowMs: 1_000 });
    expect(verifyConnectState("github", state, { secret, nowMs: 2_000 })).toMatchObject({
      productId: "prod_1",
      userId: "user_1",
    });
  });

  it("rejects tampered, foreign or expired state", () => {
    const state = createConnectState("github", "prod_1", "user_1", { secret, nowMs: 1_000 });
    const [data, signature] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString()), p: "prod_2" }),
    ).toString("base64url");

    expect(verifyConnectState("github", `${forged}.${signature}`, { secret, nowMs: 2_000 })).toBeNull();
    expect(verifyConnectState("github", state, { secret: "other", nowMs: 2_000 })).toBeNull();
    expect(verifyConnectState("github", state, { secret, nowMs: 1_000 + 31 * 60 * 1000 })).toBeNull();
    expect(verifyConnectState("github", "garbage", { secret })).toBeNull();
  });

  it("is valid for the provider it was created for only", () => {
    const state = createConnectState("github", "prod_1", "user_1", { secret, nowMs: 1_000 });
    expect(verifyConnectState("atlassian", state, { secret, nowMs: 2_000 })).toBeNull();
  });

  it("keeps GitHub's original signature, so in-flight connects survive a deploy", () => {
    const [data, signature] = createConnectState("github", "prod_1", "user_1", { secret, nowMs: 1_000 }).split(".");
    const original = createHmac("sha256", `${secret}:github-connect-state`).update(data).digest("base64url");
    expect(signature).toBe(original);
  });
});
