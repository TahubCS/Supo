import { describe, expect, it } from "vitest";

import { PRODUCTION_ORIGIN, authTrustedOrigins, normalizeOrigin } from "@/lib/trusted-origins";

import { DEFAULT_API_BASE_URL } from "../../../packages/widget/src/runtime/config";

describe("normalizeOrigin", () => {
  it("reduces URLs to their origin and rejects junk", () => {
    expect(normalizeOrigin("https://app.acme.com/path?x=1")).toBe("https://app.acme.com");
    expect(normalizeOrigin(" http://localhost:3000/ ")).toBe("http://localhost:3000");
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });
});

describe("authTrustedOrigins", () => {
  it("trusts this deployment's Vercel URLs but never a shared wildcard", () => {
    const origins = authTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: PRODUCTION_ORIGIN,
      VERCEL_PROJECT_PRODUCTION_URL: "supo.vercel.app",
      VERCEL_BRANCH_URL: "supo-git-main-tahub.vercel.app",
      VERCEL_URL: "supo-abc123-tahub.vercel.app",
    });

    expect(origins).toEqual([
      PRODUCTION_ORIGIN,
      "https://supo.vercel.app",
      "https://supo-git-main-tahub.vercel.app",
      "https://supo-abc123-tahub.vercel.app",
    ]);
    expect(origins.some((origin) => origin.includes("*"))).toBe(false);
  });

  it("adds explicitly configured extra origins", () => {
    const origins = authTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://app.acme.com, https://admin.acme.com/\nnot-an-origin",
    });

    expect(origins).toContain("https://app.acme.com");
    expect(origins).toContain("https://admin.acme.com");
    expect(origins).not.toContain("not-an-origin");
  });

  it("drops loopback origins in production, even when configured", () => {
    const origins = authTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:4000",
    });

    expect(origins).toEqual([PRODUCTION_ORIGIN]);
  });

  it("trusts localhost during development", () => {
    expect(authTrustedOrigins({ NODE_ENV: "development" })).toContain("http://localhost:3000");
  });
});

describe("PRODUCTION_ORIGIN", () => {
  it("is the widget SDK's default apiBaseUrl", () => {
    expect(DEFAULT_API_BASE_URL).toBe(PRODUCTION_ORIGIN);
  });
});
