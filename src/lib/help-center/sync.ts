import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { article, knowledgeSource } from "@/db/schema";
import { queueSourceIndexing } from "@/lib/jobs";

import { getHelpCenterForProduct, helpCenterUrl } from "./service";
import { articleKnowledgeContent } from "./text";

// ── Knowledge base mirror ──────────────────────────────────────────────────

/**
 * Mirrors a published article into the knowledge base (type "article") so the
 * AI can answer from it and cite its public URL. Unpublished articles are
 * removed from the knowledge base.
 */
export async function syncArticleKnowledge(articleId: string): Promise<void> {
  const row = await db.query.article.findFirst({ where: eq(article.id, articleId) });
  if (!row) return;

  if (row.status !== "published") {
    if (row.knowledgeSourceId) {
      await db.delete(knowledgeSource).where(eq(knowledgeSource.id, row.knowledgeSourceId));
      await db.update(article).set({ knowledgeSourceId: null }).where(eq(article.id, row.id));
    }
    return;
  }

  const center = await getHelpCenterForProduct(row.productId);
  const url = center?.enabled ? helpCenterUrl(center.slug, row.slug) : null;
  const content = articleKnowledgeContent(row);
  const now = new Date();

  const existing = row.knowledgeSourceId
    ? await db.query.knowledgeSource.findFirst({ where: eq(knowledgeSource.id, row.knowledgeSourceId) })
    : null;
  if (existing) {
    if (existing.content === content && existing.url === url && existing.name === row.title) return;
    await db
      .update(knowledgeSource)
      .set({
        name: row.title,
        url,
        content,
        status: existing.status === "indexed" && existing.chunkCount > 0 ? existing.status : "indexing",
        indexingStartedAt: now,
        errorMessage: null,
        revision: sql`${knowledgeSource.revision} + 1`,
        updatedAt: now,
      })
      .where(eq(knowledgeSource.id, existing.id));
    await queueSourceIndexing(existing.id);
    return;
  }

  const sourceId = crypto.randomUUID();
  await db.insert(knowledgeSource).values({
    id: sourceId,
    productId: row.productId,
    type: "article",
    name: row.title,
    url,
    content,
    status: "indexing",
    indexingStartedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.update(article).set({ knowledgeSourceId: sourceId }).where(eq(article.id, row.id));
  await queueSourceIndexing(sourceId);
}

/** Re-syncs every published article (e.g. after the help center URL changed). */
export async function resyncPublishedArticles(productId: string): Promise<void> {
  const rows = await db
    .select({ id: article.id })
    .from(article)
    .where(and(eq(article.productId, productId), eq(article.status, "published")))
    .limit(1000);
  for (const row of rows) await syncArticleKnowledge(row.id);
}
