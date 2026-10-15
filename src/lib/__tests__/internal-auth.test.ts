import { afterEach, describe, expect, it } from "vitest";

import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

const original = process.env.CRON_SECRET;

afterEach(() => {
  process.env.CRON_SECRET = original;
});

describe("isAuthorizedInternalRequest", () => {
  it("fails closed when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedInternalRequest(new Headers({ authorization: "Bearer " }))).toBe(false);
  });

  it("accepts the Vercel Cron bearer header and x-api-key", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedInternalRequest(new Headers({ authorization: "Bearer s3cret-value" }))).toBe(true);
    expect(isAuthorizedInternalRequest(new Headers({ "x-api-key": "s3cret-value" }))).toBe(true);
  });

  it("rejects wrong or missing secrets", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedInternalRequest(new Headers({ authorization: "Bearer nope" }))).toBe(false);
    expect(isAuthorizedInternalRequest(new Headers())).toBe(false);
  });
});
