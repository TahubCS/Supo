import { describe, expect, it } from "vitest";

import {
  crawlSite,
  isInScope,
  normalizePageUrl,
  parseRobotsSitemaps,
  parseSitemapXml,
  scopePrefix,
  type Fetcher,
} from "@/lib/knowledge/crawl";
import type { SafeFetchResult } from "@/lib/net/safe-fetch";

function response(url: string, body: string, contentType = "text/html"): SafeFetchResult {
  const bytes = new TextEncoder().encode(body);
  return { url, status: 200, contentType, body: bytes, text: () => body };
}

function fakeFetcher(site: Record<string, { body: string; type?: string }>): Fetcher {
  return async (url) => {
    const entry = site[url];
    if (!entry) throw new Error(`HTTP 404 fetching ${url}`);
    return response(url, entry.body, entry.type);
  };
}

describe("sitemap parsing", () => {
  it("separates url sets from sitemap indexes and decodes entities", () => {
    const xml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>
      <urlset><url><loc> https://a.com/x?a=1&amp;b=2 </loc></url><url><loc><![CDATA[https://a.com/y]]></loc></url></urlset>`;
    expect(parseSitemapXml(xml)).toEqual({
      sitemaps: ["https://a.com/s1.xml"],
      urls: ["https://a.com/x?a=1&b=2", "https://a.com/y"],
    });
  });

  it("reads Sitemap lines from robots.txt", () => {
    expect(parseRobotsSitemaps("User-agent: *\nDisallow: /x\nSitemap: https://a.com/sm.xml\nsitemap:https://a.com/2.xml")).toEqual([
      "https://a.com/sm.xml",
      "https://a.com/2.xml",
    ]);
  });
});

describe("scope", () => {
  it("treats www and apex as the same site and limits to the path prefix", () => {
    const root = new URL("https://www.acme.com/docs");
    expect(scopePrefix(root)).toBe("/docs/");
    expect(isInScope("https://acme.com/docs/setup", root)).toBe(true);
    expect(isInScope("https://acme.com/docs", root)).toBe(true);
    expect(isInScope("https://acme.com/blog/post", root)).toBe(false);
    expect(isInScope("https://evil.com/docs/x", root)).toBe(false);
    expect(isInScope("https://acme.com/docs/logo.png", root)).toBe(false);
  });

  it("normalizes tracking params, fragments and trailing slashes", () => {
    expect(normalizePageUrl("https://a.com/x/?utm_source=t&id=2#top")).toBe("https://a.com/x?id=2");
  });
});

describe("crawlSite", () => {
  it("uses sitemaps from robots.txt, including nested indexes", async () => {
    const fetcher = fakeFetcher({
      "https://a.com/robots.txt": { body: "Sitemap: https://a.com/index.xml", type: "text/plain" },
      "https://a.com/index.xml": {
        body: "<sitemapindex><sitemap><loc>https://a.com/pages.xml</loc></sitemap></sitemapindex>",
        type: "application/xml",
      },
      "https://a.com/pages.xml": {
        body: "<urlset><url><loc>https://a.com/a</loc></url><url><loc>https://a.com/b</loc></url><url><loc>https://other.com/c</loc></url></urlset>",
        type: "application/xml",
      },
      "https://a.com/": { body: "<html><body><main><h1>Home</h1><p>Welcome to Acme support.</p></main></body></html>" },
      "https://a.com/a": { body: "<html><head><title>A</title></head><body><p>Page A content.</p></body></html>" },
    });

    const result = await crawlSite("https://a.com/", { fetcher });
    expect(result.discovered).toBe(3);
    expect(result.pages.map((p) => p.url).sort()).toEqual(["https://a.com/", "https://a.com/a"]);
    expect(result.failed.map((f) => f.url)).toEqual(["https://a.com/b"]);
  });

  it("falls back to a link crawl with relative links when there is no sitemap", async () => {
    const fetcher = fakeFetcher({
      "https://a.com/help": {
        body: `<html><body><main><p>Help home with enough text.</p><a href="/help/billing">Billing</a><a href="/blog">Blog</a><a href="https://x.com/">X</a></main></body></html>`,
      },
      "https://a.com/help/billing": {
        body: `<html><body><main><p>Billing details.</p><a href="/help">Back</a><a href="refunds">Refunds</a></main></body></html>`,
      },
      "https://a.com/help/refunds": { body: "<html><body><main><p>Refund policy text.</p></main></body></html>" },
    });

    const result = await crawlSite("https://a.com/help", { fetcher, maxPages: 10 });
    expect(result.pages.map((p) => p.url).sort()).toEqual([
      "https://a.com/help",
      "https://a.com/help/billing",
      "https://a.com/help/refunds",
    ]);
  });

  it("respects the page budget", async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
    const site: Record<string, { body: string }> = {
      "https://a.com/": { body: `<html><body><main><p>Root</p>${links}</main></body></html>` },
    };
    for (let i = 0; i < 20; i++) site[`https://a.com/p${i}`] = { body: `<p>Page ${i}</p>` };
    const result = await crawlSite("https://a.com/", { fetcher: fakeFetcher(site), maxPages: 5 });
    expect(result.pages.length).toBe(5);
  });
});
