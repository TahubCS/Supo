"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { knowledgeSource, knowledgeSuggestion } from "@/db/schema";
import { env } from "@/lib/env";
import { geminiEmbed, geminiGenerate } from "@/lib/knowledge/ai";
import { createMissingKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import { requireProductAccess } from "@/lib/product-access";
import { requireSecurityQuota } from "@/lib/security";

async function verifyProductAccess(productId: string) {
  return requireProductAccess(productId, ["knowledge"]);
}

async function verifySuggestionAccess(suggestionId: string) {
  const suggestion = await db.query.knowledgeSuggestion.findFirst({
    where: eq(knowledgeSuggestion.id, suggestionId),
    with: { product: { columns: { id: true } } },
  });
  if (!suggestion) throw new Error("Not found");

  const access = await requireProductAccess(suggestion.product.id, ["knowledge"]);

  return { session: access.session, suggestion };
}

export type AddSourceInput = {
  type: "article" | "url" | "github";
  name: string;
  url?: string;
  content?: string;
};

export async function addSource(productId: string, input: AddSourceInput): Promise<string> {
  const { session, membership } = await verifyProductAccess(productId);
  const headerList = await headers();

  await requireSecurityQuota("knowledge.source.user.day", session.user.id, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path: "/knowledge/add-source",
    method: "POST",
  });
  await requireSecurityQuota("knowledge.source.organization.day", membership.organizationId, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path: "/knowledge/add-source",
    method: "POST",
  });

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
    with: { product: { columns: { id: true } } },
  });
  if (!source) throw new Error("Not found");
  await verifyProductAccess(source.product.id);

  await db.delete(knowledgeSource).where(eq(knowledgeSource.id, sourceId));
}

export async function reindexSource(sourceId: string): Promise<void> {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
    with: { product: { columns: { id: true } } },
  });
  if (!source) throw new Error("Not found");

  const { session, membership } = await verifyProductAccess(source.product.id);
  const headerList = await headers();
  await requireSecurityQuota("knowledge.source.user.day", session.user.id, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId: source.product.id,
    headerList,
    path: "/knowledge/reindex-source",
    method: "POST",
  });
  await requireSecurityQuota("knowledge.source.organization.day", membership.organizationId, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId: source.product.id,
    headerList,
    path: "/knowledge/reindex-source",
    method: "POST",
  });

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

  const approvedContent = suggestion.content?.trim();
  if (!suggestion.answer?.trim() || !approvedContent) {
    throw new Error("Add an answer before approving this suggestion");
  }

  const now = new Date();
  const sourceId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(knowledgeSource).values({
      id: sourceId,
      productId: suggestion.productId,
      type: "conversation",
      name: suggestion.question,
      url: null,
      content: approvedContent,
      status: "indexing",
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const reviewed = await tx
      .update(knowledgeSuggestion)
      .set({
        status: "approved",
        approvedSourceId: sourceId,
        reviewedById: session.user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(knowledgeSuggestion.id, suggestionId), eq(knowledgeSuggestion.status, "pending")))
      .returning({ id: knowledgeSuggestion.id });

    if (reviewed.length === 0) {
      throw new Error("Suggestion already reviewed");
    }
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
  const reviewed = await db
    .update(knowledgeSuggestion)
    .set({
      status: "rejected",
      reviewNote: reviewNote?.trim() || null,
      reviewedById: session.user.id,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(eq(knowledgeSuggestion.id, suggestionId), eq(knowledgeSuggestion.status, "pending")))
    .returning({ id: knowledgeSuggestion.id });

  if (reviewed.length === 0) {
    throw new Error("Suggestion already reviewed");
  }
}

export async function updateSuggestionAnswer(
  suggestionId: string,
  answer: string,
): Promise<void> {
  const { suggestion } = await verifySuggestionAccess(suggestionId);
  if (suggestion.status !== "pending") throw new Error("Suggestion already reviewed");
  if (suggestion.kind !== "gap") throw new Error("Only missing-knowledge gaps can be edited here");

  const trimmedAnswer = answer.trim();
  if (!trimmedAnswer) throw new Error("Answer is required");

  const now = new Date();
  const updated = await db
    .update(knowledgeSuggestion)
    .set({
      answer: trimmedAnswer,
      content: `**Q: ${suggestion.question}**\n\n${trimmedAnswer}`,
      updatedAt: now,
    })
    .where(and(eq(knowledgeSuggestion.id, suggestionId), eq(knowledgeSuggestion.status, "pending")))
    .returning({ id: knowledgeSuggestion.id });

  if (updated.length === 0) {
    throw new Error("Suggestion already reviewed");
  }
}

export type QueryResult = {
  answer: string;
  sources: { name: string; url: string | null }[];
};

export async function testQuery(productId: string, question: string): Promise<QueryResult> {
  const { session, membership } = await verifyProductAccess(productId);
  const headerList = await headers();

  await requireSecurityQuota("knowledge.test.user.hour", session.user.id, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path: "/knowledge/test-query",
    method: "POST",
  });
  await requireSecurityQuota("knowledge.test.product.day", productId, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path: "/knowledge/test-query",
    method: "POST",
  });

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
    try {
      await createMissingKnowledgeSuggestion({
        productId,
        question,
        reason:
          "An admin tested this question, but no indexed knowledge matched above the retrieval threshold.",
      });
    } catch {
      // The test answer should still render if gap capture fails.
    }

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
