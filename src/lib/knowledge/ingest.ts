import { eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeChunk, knowledgeSource } from "@/db/schema";

import { geminiEmbedMany } from "./ai";

type KnowledgeChunkInsert = typeof knowledgeChunk.$inferInsert;

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

export function chunkText(text: string): string[] {
  const TARGET = 800;
  const OVERLAP = 200;

  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 1 > TARGET && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-OVERLAP) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}

// ---------------------------------------------------------------------------
// Content hash — SHA-256, hex-encoded (built-in Web Crypto, no extra deps)
// ---------------------------------------------------------------------------

export async function computeHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Supo-Bot/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000);
}

type GitHubFile = { name: string; content: string };

export async function fetchGitHub(repoUrl: string): Promise<GitHubFile[]> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub URL — expected https://github.com/owner/repo");
  const [, owner, repo] = match;
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };

  const files: GitHubFile[] = [];

  try {
    const r = await fetch(`${base}/readme`, { headers });
    if (r.ok) {
      const data = (await r.json()) as { content: string; name: string };
      files.push({ name: data.name, content: Buffer.from(data.content, "base64").toString("utf8") });
    }
  } catch {
    // no readme
  }

  async function fetchDir(path: string, depth = 0) {
    if (files.length >= 20 || depth > 3) return;
    try {
      const r = await fetch(`${base}/contents/${path}`, { headers });
      if (!r.ok) return;
      const items = (await r.json()) as Array<{
        type: string;
        name: string;
        path: string;
        download_url: string | null;
      }>;
      for (const item of items) {
        if (files.length >= 20) break;
        if (item.type === "dir") {
          await fetchDir(item.path, depth + 1);
        } else if (item.type === "file" && item.name.endsWith(".md") && item.download_url) {
          const fr = await fetch(item.download_url);
          if (fr.ok) files.push({ name: item.path, content: await fr.text() });
        }
      }
    } catch {
      // ignore fetch errors for individual dirs
    }
  }

  await fetchDir("docs");
  return files;
}

// ---------------------------------------------------------------------------
// Sitemap-driven URL discovery (for "sitemap" source type)
// ---------------------------------------------------------------------------

export async function discoverSitemapUrls(rootUrl: string): Promise<string[]> {
  let root: URL;
  try {
    root = new URL(rootUrl);
  } catch {
    return [rootUrl];
  }

  const seen = new Set<string>();
  seen.add(rootUrl);

  // 1. Try sitemap.xml
  try {
    const sitemapUrl = `${root.origin}/sitemap.xml`;
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "Supo-Bot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)]
        .map((m) => m[1].trim())
        .filter((u) => {
          try {
            return new URL(u).hostname === root.hostname;
          } catch {
            return false;
          }
        });
      for (const u of locs) {
        seen.add(u);
        if (seen.size >= 30) break;
      }
      // If sitemap gave us additional URLs, trust it
      if (seen.size > 1) return [...seen].slice(0, 30);
    }
  } catch {
    // sitemap not available — fall through
  }

  // 2. Fallback: extract same-domain <a href> links from root page
  try {
    const res = await fetch(rootUrl, {
      headers: { "User-Agent": "Supo-Bot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const html = await res.text();
      const hrefs = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
      for (const href of hrefs) {
        try {
          const u = new URL(href);
          if (u.hostname !== root.hostname) continue;
          // Deduplicate by stripping query strings
          u.search = "";
          u.hash = "";
          seen.add(u.toString());
        } catch {
          // invalid URL
        }
        if (seen.size >= 30) break;
      }
    }
  } catch {
    // root page unavailable — return what we have
  }

  return [...seen].slice(0, 30);
}

// ---------------------------------------------------------------------------
// Core ingestion — pure: chunk → embed → insert. Caller owns status updates.
// ---------------------------------------------------------------------------

export async function ingestText(
  text: string,
  sourceId: string,
  productId: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  const rows = await buildChunkRows(text, sourceId, productId, metadata);
  await insertChunkRows(rows);
  return rows.length;
}

async function buildChunkRows(
  text: string,
  sourceId: string,
  productId: string,
  metadata: Record<string, unknown>,
): Promise<KnowledgeChunkInsert[]> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return [];

  const embeddings = await geminiEmbedMany(chunks, productId);

  return chunks.map((content, i) => ({
    id: crypto.randomUUID(),
    sourceId,
    productId,
    content,
    embedding: embeddings[i],
    metadata: JSON.stringify({ ...metadata, chunkIndex: i }),
    createdAt: new Date(),
  }));
}

async function insertChunkRows(rows: KnowledgeChunkInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(knowledgeChunk).values(rows.slice(i, i + 50));
  }
}

// ---------------------------------------------------------------------------
// ingestSource — full re-index. Owns all status transitions + hash storage.
// ---------------------------------------------------------------------------

export async function ingestSource(sourceId: string, productId: string): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
  });
  if (!source) throw new Error("Source not found: " + sourceId);

  if (source.status !== "indexed") {
    await db
      .update(knowledgeSource)
      .set({ status: "indexing", errorMessage: null, updatedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
  }

  try {
    let allContent = "";
    const rows: KnowledgeChunkInsert[] = [];

    if (source.type === "article" || source.type === "conversation") {
      if (!source.content) throw new Error("No content to index");
      allContent = source.content;
      rows.push(...await buildChunkRows(source.content, sourceId, productId, { title: source.name }));
    } else if (source.type === "url") {
      if (!source.url) throw new Error("No URL to fetch");
      allContent = await fetchUrl(source.url);
      rows.push(...await buildChunkRows(allContent, sourceId, productId, {
        title: source.name,
        url: source.url,
      }));
    } else if (source.type === "github") {
      if (!source.url) throw new Error("No repo URL");
      const files = await fetchGitHub(source.url);
      if (files.length === 0) throw new Error("No markdown files found in repo");
      allContent = files.map((f) => f.content).join("\n\n");
      for (const file of files) {
        rows.push(...await buildChunkRows(file.content, sourceId, productId, {
          title: file.name,
          url: source.url,
        }));
      }
    } else if (source.type === "sitemap") {
      if (!source.url) throw new Error("No URL");
      const urls = await discoverSitemapUrls(source.url);
      const pageContents: string[] = [];
      for (const url of urls) {
        try {
          const text = await fetchUrl(url);
          pageContents.push(text);
          const title = url.split("/").filter(Boolean).pop() ?? url;
          rows.push(...await buildChunkRows(text, sourceId, productId, { title, url }));
        } catch {
          // skip failed pages, continue with rest
        }
      }
      allContent = pageContents.join("\n\n");
    }

    if (rows.length === 0) {
      throw new Error("No indexable content found");
    }

    const now = new Date();
    const contentHash = await computeHash(allContent);

    await db.transaction(async (tx) => {
      await tx.delete(knowledgeChunk).where(eq(knowledgeChunk.sourceId, sourceId));
      for (let i = 0; i < rows.length; i += 50) {
        await tx.insert(knowledgeChunk).values(rows.slice(i, i + 50));
      }
      await tx
        .update(knowledgeSource)
        .set({
          status: "indexed",
          chunkCount: rows.length,
          contentHash,
          lastCheckedAt: now,
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(knowledgeSource.id, sourceId));
    });
  } catch (err) {
    await db
      .update(knowledgeSource)
      .set({
        status: source.status === "indexed" ? "indexed" : "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSource.id, sourceId));
  }
}

// ---------------------------------------------------------------------------
// ingestSourceIfChanged — used by cron. Skips re-embed when content unchanged.
// ---------------------------------------------------------------------------

export async function ingestSourceIfChanged(
  sourceId: string,
  productId: string,
): Promise<"skipped" | "reindexed" | "error"> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
  });
  if (!source) return "error";

  try {
    let currentContent = "";

    if (source.type === "url") {
      if (!source.url) return "error";
      currentContent = await fetchUrl(source.url);
    } else if (source.type === "github") {
      if (!source.url) return "error";
      const files = await fetchGitHub(source.url);
      currentContent = files.map((f) => f.content).join("\n\n");
    } else if (source.type === "sitemap") {
      if (!source.url) return "error";
      const urls = await discoverSitemapUrls(source.url);
      const texts: string[] = [];
      for (const url of urls) {
        try {
          texts.push(await fetchUrl(url));
        } catch {
          // skip
        }
      }
      currentContent = texts.join("\n\n");
    } else {
      // article/conversation — can't auto-fetch; only checked if explicitly requested
      return "skipped";
    }

    const currentHash = await computeHash(currentContent);
    const now = new Date();

    if (currentHash === source.contentHash) {
      // Content unchanged — update timestamp only
      await db
        .update(knowledgeSource)
        .set({ lastCheckedAt: now })
        .where(eq(knowledgeSource.id, sourceId));
      return "skipped";
    }

    // Content changed — full re-index
    await ingestSource(sourceId, productId);
    return "reindexed";
  } catch (err) {
    await db
      .update(knowledgeSource)
      .set({
        status: source.status === "indexed" ? "indexed" : "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSource.id, sourceId));
    return "error";
  }
}
