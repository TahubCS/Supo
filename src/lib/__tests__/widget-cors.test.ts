import { describe, expect, it } from "vitest";

import {
  isOriginAllowed,
  normalizeAllowedOrigin,
  parseAllowedOrigins,
  widgetCorsHeaders,
} from "@/lib/widget-cors";

describe("normalizeAllowedOrigin", () => {
  it("accepts full origins, bare hosts and wildcards", () => {
    expect(normalizeAllowedOrigin("https://App.Acme.com/")).toBe("https://app.acme.com");
    expect(normalizeAllowedOrigin("acme.com")).toBe("https://acme.com");
    expect(normalizeAllowedOrigin("*.acme.com")).toBe("https://*.acme.com");
    expect(normalizeAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeAllowedOrigin("https://app.acme.com:443")).toBe("https://app.acme.com");
    expect(normalizeAllowedOrigin("http://acme.com:80")).toBe("http://acme.com");
    expect(normalizeAllowedOrigin("https://acme.com:8443")).toBe("https://acme.com:8443");
  });

  it("rejects paths, junk and single-label hosts", () => {
    expect(normalizeAllowedOrigin("https://acme.com/path")).toBeNull();
    expect(normalizeAllowedOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeAllowedOrigin("intranet")).toBeNull();
    expect(normalizeAllowedOrigin("https://acme..com")).toBeNull();
  });
});

describe("parseAllowedOrigins", () => {
  it("splits on whitespace/commas, dedupes and reports invalid entries", () => {
    const result = parseAllowedOrigins("acme.com, https://acme.com\n*.acme.io bad/entry");
    expect(result.origins).toEqual(["https://acme.com", "https://*.acme.io"]);
    expect(result.invalid).toEqual(["bad/entry"]);
  });
});

describe("isOriginAllowed", () => {
  const allowed = ["https://acme.com", "https://*.acme.io"];

  it("allows everything when no allow-list is configured", () => {
    expect(isOriginAllowed(null, [])).toBe(true);
    expect(isOriginAllowed("https://evil.com", [])).toBe(true);
  });

  it("matches exact origins and wildcard subdomains only", () => {
    expect(isOriginAllowed("https://acme.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://docs.acme.io", allowed)).toBe(true);
    expect(isOriginAllowed("https://acme.io", allowed)).toBe(false);
    expect(isOriginAllowed("https://evilacme.io", allowed)).toBe(false);
    expect(isOriginAllowed("http://acme.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://acme.com.evil.com", allowed)).toBe(false);
  });

  it("treats default ports as equivalent to no port", () => {
    expect(isOriginAllowed("https://app.acme.com", ["https://app.acme.com:443"])).toBe(true);
    expect(isOriginAllowed("https://app.acme.com:8443", ["https://app.acme.com"])).toBe(false);
  });

  it("rejects missing origins when restricted, but trusts the dashboard origin", () => {
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed("https://supo.app", allowed, ["https://supo.app"])).toBe(true);
  });
});

describe("widgetCorsHeaders", () => {
  it("uses * when open and echoes the origin when restricted", () => {
    expect(widgetCorsHeaders("https://x.com", []).get("access-control-allow-origin")).toBe("*");
    const restricted = widgetCorsHeaders("https://acme.com", ["https://acme.com"]);
    expect(restricted.get("access-control-allow-origin")).toBe("https://acme.com");
    expect(restricted.get("vary")).toBe("Origin");
  });
});
