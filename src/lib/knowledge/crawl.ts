import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";

import { extractDocument } from "./extract";

// Website crawler for knowledge sources: discovers pages through robots.txt
// sitemaps (including sitemap indexes), falling back to a breadth-first link
// crawl scoped to the starting site and path.

export type CrawledPage = { url: string; title: string | null; text: string };

export type CrawlResult = {
  pages: CrawledPage[];
  failed: { url: string; error: string }[];
  discovered: number;
};

export type Fetcher = (url: string, kind: "page" | "sitemap" | "robots") => Promise<SafeFetchResult>;

export type CrawlOptions = {
  maxPages?: number;
  concurrency?: number;
  maxDepth?: number;
  fetcher?: Fetcher;
};

const PAGE_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown"];
const SKIP_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|xml|rss|atom|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|eot|pdf|docx?|xlsx?|pptx?)$/i;

const defaultFetcher: Fetcher = (url, kind) =>
  safeFetch(url, {
    timeoutMs: kind === "page" ? 15_000 : 10_000,
    maxBytes: kind === "page" ? 3 * 1024 * 1024 : 10 * 1024 * 1024,
    allowedContentTypes:
      kind === "page" ? PAGE_CONTENT_TYPES : kind === "robots" ? ["text/"] : undefined,
  });

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseSitemapXml(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = (block: string) =>
    [...block.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
      decodeXmlEntities(m[1].trim()),
    );

  const sitemaps = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)].flatMap((m) => locs(m[1]));
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].flatMap((m) => locs(m[1]));
  return { urls, sitemaps };
}

export function parseRobotsSitemaps(robots: string): string[] {
  return robots
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1])
    .filter((value): value is string => Boolean(value));
}

function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function scopePrefix(root: URL): string {
  const path = root.pathname;
  if (path.endsWith("/")) return path;
  const lastSlash = path.lastIndexOf("/");
  const lastSegment = path.slice(lastSlash + 1);
  // "/docs" is treated as a section, "/docs/intro.html" as a page inside "/docs/".
  return lastSegment.includes(".") ? path.slice(0, lastSlash + 1) : `${path}/`;
}

export function isInScope(candidate: string, root: URL): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (siteKey(url.hostname) !== siteKey(root.hostname)) return false;
  if (SKIP_EXTENSIONS.test(url.pathname)) return false;
  const prefix = scopePrefix(root);
  const pathWithSlash = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return prefix === "/" || pathWithSlash.startsWith(prefix);
}

export function normalizePageUrl(candidate: string): string {
  const url = new URL(candidate);
  url.hash = "";
  // Tracking parameters create duplicate pages.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function discoverFromSitemaps(root: URL, fetcher: Fetcher, maxPages: number): Promise<string[]> {
  const queue: string[] = [];
  try {
    const robots = await fetcher(`${root.origin}/robots.txt`, "robots");
    queue.push(...parseRobotsSitemaps(robots.text()));
  } catch {
    // no robots.txt
  }
  if (queue.length === 0) queue.push(`${root.origin}/sitemap.xml`, `${root.origin}/sitemap_index.xml`);

  const seenSitemaps = new Set<string>();
  const pages = new Set<string>();
  let fetchedSitemaps = 0;

  while (queue.length > 0 && fetchedSitemaps < 25 && pages.size < maxPages * 3) {
    const sitemapUrl = queue.shift()!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    try {
      const response = await fetcher(sitemapUrl, "sitemap");
      fetchedSitemaps++;
      const { urls, sitemaps } = parseSitemapXml(response.text());
      queue.push(...sitemaps.filter((s) => !seenSitemaps.has(s)));
      for (const url of urls) {
        if (isInScope(url, root)) pages.add(normalizePageUrl(url));
      }
    } catch {
      // missing or invalid sitemap; try the next one
    }
  }

  // Keep the starting page first, then shortest paths (usually the most important).
  const ordered = [...pages].sort((a, b) => a.length - b.length);
  const start = normalizePageUrl(root.toString());
  return [start, ...ordered.filter((u) => u !== start)].slice(0, maxPages);
}

async function fetchPage(url: string, fetcher: Fetcher) {
  const response = await fetcher(url, "page");
  const doc = extractDocument(response.text(), response.contentType, response.url);
  return { finalUrl: response.url, doc };
}

export async function crawlSite(rootUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 50, 500));
  const concurrency = options.concurrency ?? 4;
  const maxDepth = options.maxDepth ?? 3;
  const fetcher = options.fetcher ?? defaultFetcher;
  const root = new URL(rootUrl);

  const pages: CrawledPage[] = [];
  const failed: { url: string; error: string }[] = [];

  const fromSitemaps = await discoverFromSitemaps(root, fetcher, maxPages);

  if (fromSitemaps.length > 1) {
    await mapLimit(fromSitemaps, concurrency, async (url) => {
      try {
        const { finalUrl, doc } = await fetchPage(url, fetcher);
        if (doc.text.trim()) pages.push({ url: finalUrl, title: doc.title, text: doc.text });
      } catch (error) {
        failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    });
    return { pages, failed, discovered: fromSitemaps.length };
  }

  // No usable sitemap: breadth-first crawl following in-scope links.
  const seen = new Set<string>([normalizePageUrl(root.toString())]);
  let frontier = [normalizePageUrl(root.toString())];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0 && pages.length < maxPages; depth++) {
    const batch = frontier.slice(0, maxPages - pages.length);
    const nextFrontier: string[] = [];
    await mapLimit(batch, concurrency, async (url) => {
      try {
        const { finalUrl, doc } = await fetchPage(url, fetcher);
        if (doc.text.trim()) pages.push({ url: finalUrl, title: doc.title, text: doc.text });
        for (const link of doc.links) {
          if (!isInScope(link, root)) continue;
          const normalized = normalizePageUrl(link);
          if (!seen.has(normalized)) {
            seen.add(normalized);
            nextFrontier.push(normalized);
          }
        }
      } catch (error) {
        failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    });
    frontier = nextFrontier;
  }

  return { pages: pages.slice(0, maxPages), failed, discovered: seen.size };
}
