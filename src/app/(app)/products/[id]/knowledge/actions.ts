"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { knowledgeSource, knowledgeSuggestion, member, product } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { geminiEmbed, geminiGenerate } from "@/lib/knowledge/ai";

async function verifyProductAccess(productId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

  const found = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!found || found.organizationId !== membership.organizationId) {
    throw new Error("Not found");
  }

  return { session, membership };
}

async function verifySuggestionAccess(suggestionId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const suggestion = await db.query.knowledgeSuggestion.findFirst({
    where: eq(knowledgeSuggestion.id, suggestionId),
    with: { product: { columns: { id: true, organizationId: true } } },
  });
  if (!suggestion) throw new Error("Not found");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership || membership.organizationId !== suggestion.product.organizationId) {
    throw new Error("Not found");
  }

  return { session, suggestion };
}

export type AddSourceInput = {
  type: "article" | "url" | "github";
  name: string;
  url?: string;
  content?: string;
};

export async function addSource(productId: string, input: AddSourceInput): Promise<string> {
  await verifyProductAccess(productId);

  const sourceId = crypto.randomUUID();
  const now = new Date();

  await db.insert(knowledgeSource).values({
    id: sourceId,
    productId,
    type: input.type,
    name: input.name,
    url: input.url ?? null,
    content: input.content ?? null,
    status: "indexing",
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Fire ingestion in background — non-blocking
  const baseUrl = env.BETTER_AUTH_URL;
  fetch(`${baseUrl}/api/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.BETTER_AUTH_API_KEY,
    },
    body: JSON.stringify({ sourceId, productId }),
  }).catch(() => {
    // Background — errors handled inside the route
  });

  return sourceId;
}

export async function deleteSource(sourceId: string): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
    with: { product: { columns: { organizationId: true } } },
  });
  if (!source) throw new Error("Not found");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership || membership.organizationId !== source.product.organizationId) {
    throw new Error("Not found");
  }

  await db.delete(knowledgeSource).where(eq(knowledgeSource.id, sourceId));
}

export async function reindexSource(sourceId: string): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
    with: { product: { columns: { organizationId: true, id: true } } },
  });
  if (!source) throw new Error("Not found");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership || membership.organizationId !== source.product.organizationId) {
    throw new Error("Not found");
  }

  if (source.status !== "indexed") {
    await db
      .update(knowledgeSource)
      .set({ status: "indexing", chunkCount: 0, errorMessage: null, updatedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
  } else {
    await db
      .update(knowledgeSource)
      .set({ errorMessage: null, updatedAt: new Date() })
      .where(eq(knowledgeSource.id, sourceId));
  }

  const baseUrl = env.BETTER_AUTH_URL;
  fetch(`${baseUrl}/api/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.BETTER_AUTH_API_KEY,
    },
    body: JSON.stringify({ sourceId, productId: source.product.id }),
  }).catch(() => {});
}

export async function approveSuggestion(suggestionId: string): Promise<void> {
  const { session, suggestion } = await verifySuggestionAccess(suggestionId);
  if (suggestion.status !== "pending") throw new Error("Suggestion already reviewed");

  const now = new Date();
  const sourceId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(knowledgeSource).values({
      id: sourceId,
      productId: suggestion.productId,
      type: "conversation",
      name: suggestion.question,
      url: null,
      content: suggestion.content,
      status: "indexing",
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(knowledgeSuggestion)
      .set({
        status: "approved",
        approvedSourceId: sourceId,
        reviewedById: session.user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(knowledgeSuggestion.id, suggestionId));
  });

  fetch(`${env.BETTER_AUTH_URL}/api/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.BETTER_AUTH_API_KEY,
    },
    body: JSON.stringify({ sourceId, productId: suggestion.productId }),
  }).catch(() => {});
}

export async function rejectSuggestion(
  suggestionId: string,
  reviewNote?: string,
): Promise<void> {
  const { session, suggestion } = await verifySuggestionAccess(suggestionId);
  if (suggestion.status !== "pending") throw new Error("Suggestion already reviewed");

  const now = new Date();
  await db
    .update(knowledgeSuggestion)
    .set({
      status: "rejected",
      reviewNote: reviewNote?.trim() || null,
      reviewedById: session.user.id,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(knowledgeSuggestion.id, suggestionId));
}

export type QueryResult = {
  answer: string;
  sources: { name: string; url: string | null }[];
};

export async function testQuery(productId: string, question: string): Promise<QueryResult> {
  await verifyProductAccess(productId);

  const queryEmbedding = await geminiEmbed(question, productId);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(
    sql`SELECT kc.content, kc.metadata, ks.name AS source_name, ks.url AS source_url,
               1 - (kc.embedding <=> ${vectorStr}::vector) AS similarity
        FROM knowledge_chunk kc
        JOIN knowledge_source ks ON ks.id = kc.source_id
        WHERE kc.product_id = ${productId}
          AND ks.status = 'indexed'
        ORDER BY kc.embedding <=> ${vectorStr}::vector
        LIMIT 5`,
  );

  type ChunkRow = {
    content: string;
    metadata: string | null;
    source_name: string;
    source_url: string | null;
    similarity: number;
  };

  const MIN_SIMILARITY = 0.4;
  const chunks = (results.rows as ChunkRow[]).filter((c) => c.similarity >= MIN_SIMILARITY);

  if (chunks.length === 0) {
    return {
      answer: "No relevant content found in the knowledge base for that question.",
      sources: [],
    };
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.source_name}\n${c.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `You are a helpful support assistant. Answer the user's question using ONLY the provided knowledge base context.
Be concise and accurate. If the context doesn't contain enough information, say so clearly.
Cite sources as [1], [2], etc.`;

  const answer = await geminiGenerate(
    `Knowledge base context:\n${context}\n\nQuestion: ${question}`,
    systemPrompt,
  );

  const sources = chunks
    .map((c) => ({ name: c.source_name, url: c.source_url }))
    .filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i);

  return { answer, sources };
}
