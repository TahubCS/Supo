"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { knowledgeChunk, knowledgeSource, knowledgeSuggestion, widgetConfig } from "@/db/schema";
import { drainSoon, queueSourceIndexing } from "@/lib/jobs";
import { geminiGenerate } from "@/lib/knowledge/ai";
import { DEFAULT_MAX_PAGES, MAX_PAGES_LIMIT } from "@/lib/knowledge/ingest";
import { parseUploadedFile } from "@/lib/knowledge/parse-file";
import { buildSupportSystemPrompt } from "@/lib/knowledge/prompt";
import { citationsFor, retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { recordProductAudit } from "@/lib/audit";
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
  type: "article" | "url" | "website" | "github";
  name: string;
  url?: string;
  content?: string;
  maxPages?: number;
};

const MAX_NAME_LENGTH = 200;
const MAX_ARTICLE_LENGTH = 200_000;

function validateHttpUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  return url.toString();
}

function validateSourceInput(input: AddSourceInput) {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error("Name is required");

  if (input.type === "article") {
    const content = input.content?.trim() ?? "";
    if (!content) throw new Error("Content is required");
    if (content.length > MAX_ARTICLE_LENGTH) {
      throw new Error(`Articles are limited to ${MAX_ARTICLE_LENGTH.toLocaleString()} characters`);
    }
    return { name, url: null, content, settings: null };
  }

  const url = validateHttpUrl(input.url);
  if (input.type === "github" && !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url)) {
    throw new Error("Enter a GitHub repository URL like https://github.com/owner/repo");
  }
  const settings =
    input.type === "website"
      ? { maxPages: Math.max(1, Math.min(Math.round(input.maxPages ?? DEFAULT_MAX_PAGES), MAX_PAGES_LIMIT)) }
      : null;
  return { name, url, content: null, settings };
}

async function requireSourceQuota(productId: string, path: string) {
  const { session, membership } = await verifyProductAccess(productId);
  const headerList = await headers();
  const event = {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path,
    method: "POST",
  };
  await requireSecurityQuota("knowledge.source.user.day", session.user.id, event);
  await requireSecurityQuota("knowledge.source.organization.day", membership.organizationId, event);
}

async function auditKnowledge(
  productId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  const access = await verifyProductAccess(productId);
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action,
    targetType: "knowledge_source",
    targetId,
    metadata,
  });
}

async function verifySourceAccess(sourceId: string) {
  const source = await db.query.knowledgeSource.findFirst({
    where: eq(knowledgeSource.id, sourceId),
  });
  if (!source) throw new Error("Not found");
  await verifyProductAccess(source.productId);
  return source;
}

export async function addSource(productId: string, input: AddSourceInput): Promise<string> {
  await requireSourceQuota(productId, "/knowledge/add-source");
  const values = validateSourceInput(input);

  const sourceId = crypto.randomUUID();
  const now = new Date();

  await db.insert(knowledgeSource).values({
    id: sourceId,
    productId,
    type: input.type,
    name: values.name,
    url: values.url,
    content: values.content,
    settings: values.settings,
    status: "indexing",
    indexingStartedAt: now,
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await queueSourceIndexing(sourceId);
  await auditKnowledge(productId, "knowledge.source_added", sourceId, { type: input.type, name: values.name });
  return sourceId;
}

/** Adds an uploaded document (PDF, Word, Markdown, …) as a text source. */
export async function uploadSourceFile(
  productId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await verifyProductAccess(productId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload" };
    const parsed = await parseUploadedFile(file.name, new Uint8Array(await file.arrayBuffer()));
    const name = String(formData.get("name") ?? "").trim() || parsed.title;
    const id = await addSource(productId, { type: "article", name, content: parsed.text.slice(0, MAX_ARTICLE_LENGTH) });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add this file" };
  }
}

export type UpdateSourceInput = {
  name?: string;
  url?: string;
  content?: string;
  maxPages?: number;
};

export async function updateSource(sourceId: string, input: UpdateSourceInput): Promise<void> {
  const source = await verifySourceAccess(sourceId);
  const type = (source.type === "sitemap" ? "website" : source.type) as AddSourceInput["type"] | "conversation";
  const values = validateSourceInput({
    type: type === "conversation" ? "article" : type,
    name: input.name ?? source.name,
    url: input.url ?? source.url ?? undefined,
    content: input.content ?? source.content ?? undefined,
    maxPages: input.maxPages ?? source.settings?.maxPages,
  });

  const contentChanged =
    values.url !== (type === "article" || type === "conversation" ? null : source.url) ||
    values.content !== (type === "article" || type === "conversation" ? source.content?.trim() : null) ||
    (values.settings?.maxPages ?? null) !== (source.settings?.maxPages ?? null);

  await db
    .update(knowledgeSource)
    .set({
      name: values.name,
      url: values.url ?? source.url,
      content: values.content ?? source.content,
      settings: values.settings ?? source.settings,
      ...(contentChanged ? { revision: sql`${knowledgeSource.revision} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSource.id, sourceId));

  if (contentChanged) {
    await requireSourceQuota(source.productId, "/knowledge/update-source");
    await queueSourceIndexing(sourceId);
  }
  await auditKnowledge(source.productId, "knowledge.source_updated", sourceId, { name: values.name, contentChanged });
}

export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  const source = await verifySourceAccess(sourceId);
  await db
    .update(knowledgeSource)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(knowledgeSource.id, sourceId));
  await auditKnowledge(source.productId, enabled ? "knowledge.source_enabled" : "knowledge.source_disabled", sourceId, {
    name: source.name,
  });
}

export async function deleteSource(sourceId: string): Promise<void> {
  const source = await verifySourceAccess(sourceId);
  await db.delete(knowledgeSource).where(eq(knowledgeSource.id, sourceId));
  await auditKnowledge(source.productId, "knowledge.source_deleted", sourceId, { name: source.name, type: source.type });
}

export async function reindexSource(sourceId: string): Promise<void> {
  const source = await verifySourceAccess(sourceId);
  await requireSourceQuota(source.productId, "/knowledge/reindex-source");

  const bump = { revision: sql`${knowledgeSource.revision} + 1` };
  await db
    .update(knowledgeSource)
    .set(
      source.status === "indexed" && source.chunkCount > 0
        ? { ...bump, errorMessage: null, updatedAt: new Date() }
        : { ...bump, status: "indexing", indexingStartedAt: new Date(), errorMessage: null, updatedAt: new Date() },
    )
    .where(eq(knowledgeSource.id, sourceId));

  await queueSourceIndexing(sourceId);
}

export type SourceStatus = {
  id: string;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  pageCount: number;
  lastCheckedAt: Date | null;
  updatedAt: Date;
};

/** Lightweight status snapshot used by the UI while sources are indexing. */
export async function getSourceStatuses(productId: string): Promise<SourceStatus[]> {
  await verifyProductAccess(productId);
  // The UI polls this while sources are indexing: use that traffic to run
  // due retries instead of waiting for the next cron run.
  drainSoon();
  return db.query.knowledgeSource.findMany({
    where: eq(knowledgeSource.productId, productId),
    columns: {
      id: true,
      status: true,
      errorMessage: true,
      chunkCount: true,
      pageCount: true,
      lastCheckedAt: true,
      updatedAt: true,
    },
  });
}

export type SourceChunkPreview = {
  id: string;
  content: string;
  title: string | null;
  url: string | null;
  headingPath: string[];
};

export async function getSourceChunks(sourceId: string): Promise<SourceChunkPreview[]> {
  await verifySourceAccess(sourceId);
  const rows = await db.query.knowledgeChunk.findMany({
    where: eq(knowledgeChunk.sourceId, sourceId),
    columns: { id: true, content: true, metadata: true },
    limit: 200,
  });
  const parsed = rows.map((row) => {
    let meta: { title?: string; url?: string; headingPath?: string[]; chunkIndex?: number } = {};
    try {
      meta = row.metadata ? JSON.parse(row.metadata) : {};
    } catch {
      // ignore malformed metadata
    }
    return {
      chunk: {
        id: row.id,
        content: row.content,
        title: meta.title ?? null,
        url: meta.url ?? null,
        headingPath: Array.isArray(meta.headingPath) ? meta.headingPath : [],
      },
      order: `${meta.url ?? ""}#${String(meta.chunkIndex ?? 0).padStart(6, "0")}`,
    };
  });
  return parsed.sort((a, b) => a.order.localeCompare(b.order)).map((entry) => entry.chunk);
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
      name: suggestion.question.slice(0, MAX_NAME_LENGTH),
      url: null,
      content: approvedContent,
      status: "indexing",
      indexingStartedAt: now,
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

  await queueSourceIndexing(sourceId);
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
  sources: { title: string; url: string | null }[];
  matches: { title: string; url: string | null; similarity: number | null; relevant: boolean; preview: string }[];
};

export async function testQuery(productId: string, question: string): Promise<QueryResult> {
  const { session, membership, product: foundProduct } = await verifyProductAccess(productId);
  const headerList = await headers();
  const trimmed = question.trim().slice(0, 2000);
  if (!trimmed) throw new Error("Enter a question");

  const event = {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId,
    headerList,
    path: "/knowledge/test-query",
    method: "POST",
  };
  await requireSecurityQuota("knowledge.test.user.hour", session.user.id, event);
  await requireSecurityQuota("knowledge.test.product.day", productId, event);

  // Same retrieval + prompt as the live widget, so test results are representative.
  const retrieval = await retrieveKnowledge({ productId, query: trimmed });
  const config = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, productId),
    columns: { botName: true },
  });
  const system = buildSupportSystemPrompt({
    botName: config?.botName ?? "Support",
    productName: foundProduct.name,
    productDescription: foundProduct.description,
    chunks: retrieval.chunks,
  });
  const answer = await geminiGenerate(trimmed, system);

  return {
    answer,
    sources: citationsFor(retrieval.chunks),
    matches: retrieval.candidates.slice(0, 8).map((c) => ({
      title: [c.title, ...c.headingPath].filter(Boolean).join(" > "),
      url: c.url,
      similarity: c.similarity,
      relevant: c.relevant,
      preview: c.content.slice(0, 240),
    })),
  };
}
