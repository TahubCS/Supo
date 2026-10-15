import { eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeChunk, knowledgeSource } from "@/db/schema";
import { safeFetch } from "@/lib/net/safe-fetch";

import { geminiEmbedManyWithModel } from "./ai";
import { buildEmbeddingText, chunkDocument } from "./chunk";
import { crawlSite } from "./crawl";
import { extractDocument } from "./extract";

type KnowledgeChunkInsert = typeof knowledgeChunk.$inferInsert;
type KnowledgeSourceRow = typeof knowledgeSource.$inferSelect;

export type IndexDocument = { title: string | null; url: string | null; text: string };

type LoadedDocuments = {
  docs: IndexDocument[];
  failedPages: number;
  totalPages: number;
};

export const DEFAULT_MAX_PAGES = 50;
export const MAX_PAGES_LIMIT = 200;
const MAX_CHUNKS_PER_SOURCE = 4000;
// Sources stuck in "indexing" longer than this are re-queued by the cron.
export const STUCK_INDEXING_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Content hash — SHA-256, hex-encoded (built-in Web Crypto, no extra deps)
// ---------------------------------------------------------------------------

export async function computeHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashDocuments(docs: IndexDocument[]): Promise<string> {
  const canonical = [...docs]
    .sort((a, b) => (a.url ?? "").localeCompare(b.url ?? ""))
    .map((d) => `${d.url ?? ""}\n${d.title ?? ""}\n${d.text}`)
    .join("\n\u0000\n");
  return computeHash(canonical);
}

// ---------------------------------------------------------------------------
// Loading source content
// ---------------------------------------------------------------------------

export async function fetchPageDocument(url: string): Promise<IndexDocument> {
  const response = await safeFetch(url, {
    allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain", "text/markdown"],
  });
  const doc = extractDocument(response.text(), response.contentType, response.url);
  if (!doc.text.trim()) throw new Error("The page has no readable text (it may require JavaScript)");
  return { title: doc.title, url: response.url, text: doc.text };
}

const GITHUB_DOC_EXTENSIONS = /\.(md|mdx|markdown|rst|txt)$/i;
const GITHUB_DOC_DIRS = ["docs", "doc", "documentation", "guides", "website/docs"];
const GITHUB_MAX_FILES = 60;

export async function fetchGitHubDocuments(repoUrl: string): Promise<IndexDocument[]> {
  const match = repoUrl.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/);
  if (!match) throw new Error("Invalid GitHub URL — expected https://github.com/owner/repo");
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const docs: IndexDocument[] = [];

  async function getJson<T>(url: string): Promise<T | null> {
    try {
      const response = await safeFetch(url, { accept: "application/vnd.github+json", timeoutMs: 10_000 });
      return JSON.parse(response.text()) as T;
    } catch {
      return null;
    }
  }

  const readme = await getJson<{ content: string; name: string; html_url: string }>(`${base}/readme`);
  if (readme?.content) {
    docs.push({
      title: `${repo} — ${readme.name}`,
      url: readme.html_url,
      text: Buffer.from(readme.content, "base64").toString("utf8"),
    });
  }

  type Item = { type: string; name: string; path: string; download_url: string | null; html_url: string };

  async function walk(path: string, depth: number) {
    if (docs.length >= GITHUB_MAX_FILES || depth > 4) return;
    const items = await getJson<Item[]>(`${base}/contents/${path}`);
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (docs.length >= GITHUB_MAX_FILES) break;
      if (item.type === "dir") {
        await walk(item.path, depth + 1);
      } else if (item.type === "file" && GITHUB_DOC_EXTENSIONS.test(item.name) && item.download_url) {
        try {
          const file = await safeFetch(item.download_url, { timeoutMs: 10_000, maxBytes: 1024 * 1024 });
          docs.push({ title: item.path, url: item.html_url, text: file.text() });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  for (const dir of GITHUB_DOC_DIRS) await walk(dir, 0);
  if (docs.length === 0) throw new Error("No README or markdown docs found in the repository");
  return docs;
}

export async function loadSourceDocuments(source: KnowledgeSourceRow): Promise<LoadedDocuments> {
  switch (source.type) {
    case "article":
    case "conversation": {
      if (!source.content?.trim()) throw new Error("No content to index");
      return { docs: [{ title: source.name, url: source.url, text: source.content }], failedPages: 0, totalPages: 1 };
    }
    case "url": {
      if (!source.url) throw new Error("No URL to fetch");
      return { docs: [await fetchPageDocument(source.url)], failedPages: 0, totalPages: 1 };
    }
    case "github": {
      if (!source.url) throw new Error("No repository URL");
      const docs = await fetchGitHubDocuments(source.url);
      return { docs, failedPages: 0, totalPages: docs.length };
    }
    case "sitemap":
    case "website": {
      if (!source.url) throw new Error("No website URL");
      const maxPages = Math.min(source.settings?.maxPages ?? DEFAULT_MAX_PAGES, MAX_PAGES_LIMIT);
      const result = await crawlSite(source.url, { maxPages });
      if (result.pages.length === 0) {
        const reason = result.failed[0]?.error;
        throw new Error(reason ? `No pages could be fetched (${reason})` : "No pages found on this website");
      }
      return {
        docs: result.pages.map((page) => ({ title: page.title, url: page.url, text: page.text })),
        failedPages: result.failed.length,
        totalPages: result.pages.length + result.failed.length,
      };
    }
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

// ---------------------------------------------------------------------------
// Chunk + embed
// ---------------------------------------------------------------------------

export async function buildChunkRows(
  docs: IndexDocument[],
  source: Pick<KnowledgeSourceRow, "id" | "productId" | "name">,
): Promise<KnowledgeChunkInsert[]> {
  const prepared: { content: string; embedText: string; metadata: Record<string, unknown> }[] = [];

  for (const doc of docs) {
    const title = doc.title?.trim() || source.name;
    for (const chunk of chunkDocument(doc.text)) {
      prepared.push({
        content: chunk.content,
        embedText: buildEmbeddingText(chunk, title),
        metadata: { title, url: doc.url, headingPath: chunk.headingPath, chunkIndex: chunk.index },
      });
      if (prepared.length >= MAX_CHUNKS_PER_SOURCE) break;
    }
    if (prepared.length >= MAX_CHUNKS_PER_SOURCE) break;
  }

  if (prepared.length === 0) return [];

  const { embeddings, model } = await geminiEmbedManyWithModel(
    prepared.map((p) => p.embedText),
    source.productId,
  );
  const now = new Date();

  return prepared.map((p, i) => ({
    id: crypto.randomUUID(),
    sourceId: source.id,
    productId: source.productId,
    content: p.content,
    embedding: embeddings[i],
    embeddingModel: model,
    metadata: JSON.stringify(p.metadata),
    createdAt: now,
  }));
}

// ---------------------------------------------------------------------------
// ingestSource — full re-index with an atomic swap of chunks.
// ---------------------------------------------------------------------------

export type IngestOptions = {
  // When false, failures are recorded as "retrying"; on the final attempt the
  // source is marked as failed. Errors are rethrown either way.
  isFinalAttempt?: boolean;
  preloaded?: LoadedDocuments;
};

export async function ingestSource(sourceId: string, options: IngestOptions = {}): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({ where: eq(knowledgeSource.id, sourceId) });
  if (!source) return; // deleted while queued — nothing to do

  const isFinalAttempt = options.isFinalAttempt ?? true;
  const wasIndexed = source.status === "indexed" && source.chunkCount > 0;

  if (!wasIndexed) {
    await db
      .update(knowledgeSource)
      .set({ status: "indexing", indexingStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
  }

  try {
    const loaded = options.preloaded ?? (await loadSourceDocuments(source));
    const rows = await buildChunkRows(loaded.docs, source);
    if (rows.length === 0) throw new Error("No indexable text found");

    const contentHash = await hashDocuments(loaded.docs);
    const now = new Date();
    const warning =
      loaded.failedPages > 0 ? `${loaded.failedPages} of ${loaded.totalPages} pages could not be fetched` : null;

    await db.transaction(async (tx) => {
      // Source may have been deleted mid-run; the FK would reject the insert.
      const stillExists = await tx.query.knowledgeSource.findFirst({
        where: eq(knowledgeSource.id, sourceId),
        columns: { id: true },
      });
      if (!stillExists) return;

      await tx.delete(knowledgeChunk).where(eq(knowledgeChunk.sourceId, sourceId));
      for (let i = 0; i < rows.length; i += 100) {
        await tx.insert(knowledgeChunk).values(rows.slice(i, i + 100));
      }
      await tx
        .update(knowledgeSource)
        .set({
          status: "indexed",
          chunkCount: rows.length,
          pageCount: loaded.docs.length,
          contentHash,
          lastCheckedAt: now,
          indexingStartedAt: null,
          errorMessage: warning,
          updatedAt: now,
        })
        .where(eq(knowledgeSource.id, sourceId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(knowledgeSource)
      .set(
        isFinalAttempt
          ? {
              // Keep serving the previous index if there is one.
              status: wasIndexed ? "indexed" : "error",
              indexingStartedAt: null,
              errorMessage: wasIndexed ? `Last refresh failed: ${message}` : message,
              updatedAt: new Date(),
            }
          : { errorMessage: `Retrying after error: ${message}`, updatedAt: new Date() },
      )
      .where(eq(knowledgeSource.id, sourceId));
    // Always surface the failure so the job is retried or recorded as failed.
    throw err;
  }
}

// ---------------------------------------------------------------------------
// syncSourceIfChanged — used by the nightly sync. Fetches once, compares the
// hash of the extracted text and only re-embeds when content changed.
// ---------------------------------------------------------------------------

export async function syncSourceIfChanged(
  sourceId: string,
  options: { isFinalAttempt?: boolean } = {},
): Promise<"skipped" | "reindexed"> {
  const source = await db.query.knowledgeSource.findFirst({ where: eq(knowledgeSource.id, sourceId) });
  if (!source) return "skipped";
  if (!["url", "github", "sitemap", "website"].includes(source.type)) return "skipped";

  const loaded = await loadSourceDocuments(source);
  const currentHash = await hashDocuments(loaded.docs);

  if (currentHash === source.contentHash && source.status === "indexed") {
    await db
      .update(knowledgeSource)
      .set({ lastCheckedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
    return "skipped";
  }

  await ingestSource(sourceId, { ...options, preloaded: loaded });
  return "reindexed";
}
