import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_API_BASE_URL, joinUrl, resolveApiBaseUrl, scriptOrigin } from "../config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveApiBaseUrl", () => {
  it("uses an explicit apiBaseUrl without trailing slashes", () => {
    expect(resolveApiBaseUrl({ apiBaseUrl: "https://support.acme.com" })).toBe("https://support.acme.com");
    expect(resolveApiBaseUrl({ apiBaseUrl: " http://localhost:3000/ " })).toBe("http://localhost:3000");
    expect(resolveApiBaseUrl({ apiBaseUrl: "https://support.acme.com//" })).toBe("https://support.acme.com");
  });

  it("falls back to Supo Cloud when apiBaseUrl is missing or blank", () => {
    expect(DEFAULT_API_BASE_URL).toBe("https://supo.muhammadtahubkhatri.dev");
    expect(resolveApiBaseUrl({})).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl({ apiBaseUrl: "" })).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl({ apiBaseUrl: "   " })).toBe(DEFAULT_API_BASE_URL);
  });

  it("ignores document.currentScript, which can be the host page's own bundle", () => {
    vi.stubGlobal("document", { currentScript: { src: "https://customer.example.com/_next/static/chunks/app.js" } });
    expect(resolveApiBaseUrl({})).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("scriptOrigin", () => {
  it("returns the origin of the script's src", () => {
    expect(scriptOrigin({ src: "https://supo.example.com/widget.js?v=1" })).toBe("https://supo.example.com");
    expect(scriptOrigin({ src: "http://localhost:3000/widget.js" })).toBe("http://localhost:3000");
  });

  it("returns undefined without a usable src", () => {
    expect(scriptOrigin(null)).toBeUndefined();
    expect(scriptOrigin(undefined)).toBeUndefined();
    expect(scriptOrigin({ src: "" })).toBeUndefined();
    expect(scriptOrigin({ src: "not a url" })).toBeUndefined();
  });
});

describe("joinUrl", () => {
  it("joins paths and passes absolute URLs through", () => {
    expect(joinUrl("https://supo.example.com", "/api/widget/messages")).toBe("https://supo.example.com/api/widget/messages");
    expect(joinUrl("https://supo.example.com", "api/widget/messages")).toBe("https://supo.example.com/api/widget/messages");
    expect(joinUrl("https://supo.example.com", "https://cdn.example.com/x")).toBe("https://cdn.example.com/x");
  });
});
