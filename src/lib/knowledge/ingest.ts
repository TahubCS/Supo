import { eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeChunk, knowledgeSource } from "@/db/schema";

import { geminiEmbedMany } from "./ai";

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

// Splits text into overlapping chunks of ~800 chars, respecting paragraph
// boundaries. Overlap is ~200 chars so adjacent chunks share context.
export function chunkText(text: string): string[] {
  const TARGET = 800;
  const OVERLAP = 200;

  // Normalize whitespace and split on blank lines / markdown headings
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
      // Keep last OVERLAP chars as prefix for next chunk
      current = current.slice(-OVERLAP) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Supo-Bot/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  // Strip scripts, styles, then all tags
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

  // Fetch README
  try {
    const r = await fetch(`${base}/readme`, { headers });
    if (r.ok) {
      const data = (await r.json()) as { content: string; name: string };
      files.push({ name: data.name, content: Buffer.from(data.content, "base64").toString("utf8") });
    }
  } catch {
    // no readme
  }

  // Fetch docs/ folder recursively (max 20 .md files)
  async function fetchDir(path: string, depth = 0) {
    if (files.length >= 20 || depth > 3) return;
    try {
      const r = await fetch(`${base}/contents/${path}`, { headers });
      if (!r.ok) return;
      const items = (await r.json()) as Array<{ type: string; name: string; path: string; download_url: string | null }>;
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
// Core ingestion
// ---------------------------------------------------------------------------

// Pure function: chunk → embed → insert. Does NOT touch knowledgeSource status.
// The caller (ingestSource) owns all status transitions.
export async function ingestText(
  text: string,
  sourceId: string,
  productId: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const embeddings = await geminiEmbedMany(chunks, productId);

  const rows = chunks.map((content, i) => ({
    id: crypto.randomUUID(),
    sourceId,
    productId,
    content,
    embedding: embeddings[i],
    metadata: JSON.stringify({ ...metadata, chunkIndex: i }),
    createdAt: new Date(),
  }));

  // Batch insert in groups of 50
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(knowledgeChunk).values(rows.slice(i, i + 50));
  }

  return chunks.length;
}

export async function ingestSource(sourceId: string, productId: string): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
  });
  if (!source) throw new Error("Source not found: " + sourceId);

  // Delete existing chunks before re-indexing
  await db.delete(knowledgeChunk).where(eq(knowledgeChunk.sourceId, sourceId));
  await db
    .update(knowledgeSource)
    .set({ status: "indexing", errorMessage: null, updatedAt: new Date() })
    .where(eq(knowledgeSource.id, sourceId));

  try {
    let total = 0;

    if (source.type === "article" || source.type === "conversation") {
      if (!source.content) throw new Error("No content to index");
      total = await ingestText(source.content, sourceId, productId, { title: source.name });
    } else if (source.type === "url") {
      if (!source.url) throw new Error("No URL to fetch");
      const text = await fetchUrl(source.url);
      total = await ingestText(text, sourceId, productId, { title: source.name, url: source.url });
    } else if (source.type === "github") {
      if (!source.url) throw new Error("No repo URL");
      const files = await fetchGitHub(source.url);
      if (files.length === 0) throw new Error("No markdown files found in repo");
      for (const file of files) {
        total += await ingestText(file.content, sourceId, productId, {
          title: file.name,
          url: source.url,
        });
      }
    }

    // Single authoritative status update — only after all files are processed
    await db
      .update(knowledgeSource)
      .set({ status: "indexed", chunkCount: total, updatedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
  } catch (err) {
    await db
      .update(knowledgeSource)
      .set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSource.id, sourceId));
    // Don't re-throw — error is persisted to DB; caller gets a clean response
  }
}
