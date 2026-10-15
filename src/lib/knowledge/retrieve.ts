import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";

import { geminiEmbedQuery } from "./ai";
import { isRelevant, mergeRankings } from "./rank";

// Hybrid knowledge retrieval shared by the widget chat, the admin test panel
// and the API: vector similarity + Postgres full-text search, merged with
// Reciprocal Rank Fusion and filtered by a relevance policy.

export type RetrievedChunk = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string | null;
  headingPath: string[];
  content: string;
  similarity: number | null;
  relevant: boolean;
};

export type Citation = { title: string; url: string | null };

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  candidates: RetrievedChunk[];
  topSimilarity: number | null;
};

const CANDIDATES = 24;

let pgvectorSupportsIterativeScan: boolean | null = null;

async function supportsIterativeScan(): Promise<boolean> {
  if (pgvectorSupportsIterativeScan !== null) return pgvectorSupportsIterativeScan;
  try {
    const result = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    const version = String((result.rows[0] as { extversion?: string } | undefined)?.extversion ?? "0");
    const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
    pgvectorSupportsIterativeScan = major > 0 || minor >= 8;
  } catch {
    pgvectorSupportsIterativeScan = false;
  }
  return pgvectorSupportsIterativeScan;
}

function scopeFilter(productId: string, model: string): SQL {
  return sql`kc.product_id = ${productId}
    AND ks.status = 'indexed'
    AND ks.enabled = true
    AND kc.embedding IS NOT NULL
    AND (kc.embedding_model IS NULL OR kc.embedding_model = ${model})`;
}

async function vectorSearch(productId: string, vector: string, model: string) {
  if (await supportsIterativeScan()) {
    // pgvector >= 0.8: keep scanning the HNSW graph until enough rows pass the
    // product filter, instead of filtering a global top-40 (which starves small tenants).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`);
      await tx.execute(sql`SET LOCAL hnsw.ef_search = 100`);
      const result = await tx.execute(sql`
        SELECT kc.id, 1 - (kc.embedding <=> ${vector}::vector) AS similarity
          FROM knowledge_chunk kc
          JOIN knowledge_source ks ON ks.id = kc.source_id
         WHERE ${scopeFilter(productId, model)}
         ORDER BY kc.embedding <=> ${vector}::vector
         LIMIT ${CANDIDATES}`);
      return result.rows as { id: string; similarity: number }[];
    });
  }

  // Older pgvector: exact search over this product's chunks only. The
  // MATERIALIZED CTE stops the planner from using the global HNSW index.
  const result = await db.execute(sql`
    WITH scoped AS MATERIALIZED (
      SELECT kc.id, kc.embedding
        FROM knowledge_chunk kc
        JOIN knowledge_source ks ON ks.id = kc.source_id
       WHERE ${scopeFilter(productId, model)}
    )
    SELECT id, 1 - (embedding <=> ${vector}::vector) AS similarity
      FROM scoped
     ORDER BY embedding <=> ${vector}::vector
     LIMIT ${CANDIDATES}`);
  return result.rows as { id: string; similarity: number }[];
}

async function keywordSearch(productId: string, query: string, model: string) {
  // OR together the query's stemmed terms so natural-language questions match
  // partially; ts_rank_cd rewards chunks that cover more of the terms.
  const result = await db.execute(sql`
    WITH q AS (
      SELECT to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', ${query})), ' | ')) AS query
    )
    SELECT kc.id, ts_rank_cd(kc.content_tsv, q.query) AS rank
      FROM knowledge_chunk kc
      JOIN knowledge_source ks ON ks.id = kc.source_id, q
     WHERE ${scopeFilter(productId, model)}
       AND q.query IS NOT NULL
       AND kc.content_tsv @@ q.query
     ORDER BY rank DESC
     LIMIT ${CANDIDATES}`);
  return result.rows as { id: string; rank: number }[];
}

type DetailRow = {
  id: string;
  source_id: string;
  source_name: string;
  source_url: string | null;
  content: string;
  metadata: string | null;
  similarity: number | null;
};

function parseMetadata(raw: string | null): { title?: string; url?: string | null; headingPath?: string[] } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { title?: string; url?: string | null; headingPath?: string[] };
  } catch {
    return {};
  }
}

export async function retrieveKnowledge({
  productId,
  query,
  limit = 6,
}: {
  productId: string;
  query: string;
  limit?: number;
}): Promise<RetrievalResult> {
  const { embedding, model } = await geminiEmbedQuery(query, productId);
  const vector = `[${embedding.join(",")}]`;

  const [vectorRows, keywordRows] = await Promise.all([
    vectorSearch(productId, vector, model),
    keywordSearch(productId, query, model).catch((error) => {
      console.error("[knowledge] keyword search failed", error);
      return [] as { id: string; rank: number }[];
    }),
  ]);

  const merged = mergeRankings(
    vectorRows.map((row) => ({ id: row.id, similarity: Number(row.similarity) })),
    keywordRows,
  ).slice(0, CANDIDATES);
  if (merged.length === 0) return { chunks: [], candidates: [], topSimilarity: null };

  const ids = merged.map((candidate) => candidate.id);
  const details = await db.execute(sql`
    SELECT kc.id, kc.source_id, ks.name AS source_name, ks.url AS source_url, kc.content, kc.metadata,
           1 - (kc.embedding <=> ${vector}::vector) AS similarity
      FROM knowledge_chunk kc
      JOIN knowledge_source ks ON ks.id = kc.source_id
     WHERE kc.product_id = ${productId}
       AND kc.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  const byId = new Map((details.rows as DetailRow[]).map((row) => [row.id, row]));

  const candidates: RetrievedChunk[] = [];
  for (const candidate of merged) {
    const row = byId.get(candidate.id);
    if (!row) continue;
    const similarity = row.similarity === null ? null : Number(row.similarity);
    const metadata = parseMetadata(row.metadata);
    candidates.push({
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      title: metadata.title || row.source_name,
      url: metadata.url ?? row.source_url,
      headingPath: Array.isArray(metadata.headingPath) ? metadata.headingPath : [],
      content: row.content,
      similarity,
      relevant: isRelevant({ ...candidate, similarity }),
    });
  }

  const similarities = candidates.map((c) => c.similarity).filter((s): s is number => s !== null);
  return {
    chunks: candidates.filter((c) => c.relevant).slice(0, limit),
    candidates,
    topSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
  };
}

/** De-duplicated citations (one per page/article) in rank order. */
export function citationsFor(chunks: RetrievedChunk[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of chunks) {
    const key = chunk.url ?? `title:${chunk.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ title: chunk.title, url: chunk.url });
  }
  return citations;
}
