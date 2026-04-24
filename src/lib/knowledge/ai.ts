import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany, generateText } from "ai";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { product } from "@/db/schema";
import { env } from "@/lib/env";

const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GEMINI_API_KEY });

// Generation: ranked by 2026 benchmarks — best reasoning first, highest capacity last.
// The full chain is exhausted before throwing, so the app never hard-crashes on a single model error.
const GENERATION_MODELS = [
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemma-4-31b",
  "gemma-4-26b",
  "gemini-2.5-flash-lite",
  "gemma-3-27b",
  "gemma-3-12b",
  "gemma-3-4b",
] as const;

// Embedding: models locked per product — switching mid-stream would break retrieval
// because different models produce incompatible vector spaces.
//
// Both models default to 3072-dim output. We pin to 768-dim via outputDimensionality
// so vectors fit the vector(768) column and stay within pgvector's 2000-dim HNSW limit.
//
// gemini-embedding-2-preview: preferred — officially supports outputDimensionality.
// gemini-embedding-001:       fallback — does not officially support custom dimensions,
//                             so it is only used if the preview model is unavailable.
const EMBEDDING_MODELS = [
  "gemini-embedding-2-preview",
  "gemini-embedding-001",
] as const;

// Dimensions stored in the DB schema (vector(768)) and used for the HNSW index.
// Changing this value requires a schema migration + full re-index of all products.
const EMBED_DIMENSIONS = 768;

// In-memory cache — embedding model is write-once per product (never changes after assignment),
// so caching in memory is safe and avoids a DB round-trip on every embed call.
const embeddingModelCache = new Map<string, string>();

// Resolves and locks the embedding model for a product.
// On first call for a product: probes models, writes the winner to DB with a
// conditional UPDATE (WHERE embedding_model IS NULL) so concurrent first-calls
// can't assign different models. On subsequent calls: returns from the in-memory cache.
export async function resolveEmbeddingModel(productId: string): Promise<string> {
  const cached = embeddingModelCache.get(productId);
  if (cached) return cached;

  const row = await db.query.product.findFirst({
    where: eq(product.id, productId),
    columns: { embeddingModel: true },
  });

  if (row?.embeddingModel) {
    embeddingModelCache.set(productId, row.embeddingModel);
    return row.embeddingModel;
  }

  for (const modelId of EMBEDDING_MODELS) {
    try {
      await embed({
        model: google.embedding(modelId),
        value: "test",
        providerOptions: { google: { outputDimensionality: EMBED_DIMENSIONS } },
      });
      // Conditional write — only succeeds if no model has been assigned yet,
      // preventing concurrent requests from overwriting each other.
      await db
        .update(product)
        .set({ embeddingModel: modelId })
        .where(and(eq(product.id, productId), isNull(product.embeddingModel)));
      embeddingModelCache.set(productId, modelId);
      return modelId;
    } catch {
      // try next
    }
  }
  throw new Error("No embedding models available for product " + productId);
}

// Used for query-time embeddings (semantic search). taskType RETRIEVAL_QUERY
// optimizes the vector for matching against indexed document chunks.
export async function geminiEmbed(text: string, productId: string): Promise<number[]> {
  const modelId = await resolveEmbeddingModel(productId);
  const { embedding } = await embed({
    model: google.embedding(modelId),
    value: text,
    providerOptions: {
      google: { outputDimensionality: EMBED_DIMENSIONS, taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
}

const EMBED_BATCH_SIZE = 100;

// Used for ingestion-time embeddings (document chunks). taskType RETRIEVAL_DOCUMENT
// optimizes the vector for being retrieved by a query.
export async function geminiEmbedMany(texts: string[], productId: string): Promise<number[][]> {
  const modelId = await resolveEmbeddingModel(productId);
  const model = google.embedding(modelId);
  const result: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const { embeddings } = await embedMany({
      model,
      values: texts.slice(i, i + EMBED_BATCH_SIZE),
      providerOptions: {
        google: { outputDimensionality: EMBED_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
      },
    });
    result.push(...embeddings);
  }

  return result;
}

export async function geminiGenerate(prompt: string, systemPrompt: string): Promise<string> {
  const errors: string[] = [];
  for (const modelId of GENERATION_MODELS) {
    try {
      const { text } = await generateText({
        model: google(modelId),
        system: systemPrompt,
        prompt,
      });
      return text;
    } catch (err) {
      errors.push(`${modelId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All generation models unavailable:\n${errors.join("\n")}`);
}
