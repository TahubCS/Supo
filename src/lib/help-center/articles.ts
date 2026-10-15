// Article writes shared by the dashboard (server actions) and the REST API.
import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { article, articleCategory, articleVersion } from "@/db/schema";
import { emitWebhookEvent } from "@/lib/webhooks/service";

import { getHelpCenterForProduct, helpCenterUrl } from "./service";
import { syncArticleKnowledge } from "./sync";
import { isValidSlug, MAX_ARTICLE_BODY, MAX_SUMMARY, MAX_TITLE, nextAvailableSlug, slugify } from "./text";

export class ArticleError extends Error {}

export type ArticleRow = typeof article.$inferSelect;

export type ArticleInput = {
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  categoryId: string | null;
};

// A new version snapshot is kept at most this often while someone is editing.
const VERSION_INTERVAL_MS = 10 * 60 * 1000;

async function takenSlugs(productId: string, excludeId?: string) {
  const rows = await db
    .select({ slug: article.slug })
    .from(article)
    .where(excludeId ? and(eq(article.productId, productId), ne(article.id, excludeId)) : eq(article.productId, productId));
  return rows.map((r) => r.slug);
}

async function assertCategory(productId: string, categoryId: string | null) {
  if (!categoryId) return;
  const category = await db.query.articleCategory.findFirst({
    where: and(eq(articleCategory.id, categoryId), eq(articleCategory.productId, productId)),
    columns: { id: true },
  });
  if (!category) throw new ArticleError("Category not found");
}

export async function createArticleRecord(
  productId: string,
  authorId: string | null,
  input: { title?: string; bodyMd?: string; summary?: string; categoryId?: string | null } = {},
): Promise<string> {
  const title = (input.title?.trim() || "Untitled article").slice(0, MAX_TITLE);
  const bodyMd = input.bodyMd ?? "";
  if (bodyMd.length > MAX_ARTICLE_BODY) {
    throw new ArticleError(`Articles are limited to ${MAX_ARTICLE_BODY.toLocaleString()} characters`);
  }
  await assertCategory(productId, input.categoryId ?? null);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(article).values({
    id,
    productId,
    categoryId: input.categoryId ?? null,
    title,
    slug: nextAvailableSlug(slugify(title) || "article", await takenSlugs(productId)),
    summary: input.summary?.trim().slice(0, MAX_SUMMARY) || null,
    bodyMd,
    status: "draft",
    authorId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Saves edits, keeping a version snapshot of the previous content. Returns the final slug. */
export async function updateArticleRecord(row: ArticleRow, authorId: string | null, input: ArticleInput): Promise<string> {
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new ArticleError("Title is required");
  if (input.bodyMd.length > MAX_ARTICLE_BODY) {
    throw new ArticleError(`Articles are limited to ${MAX_ARTICLE_BODY.toLocaleString()} characters`);
  }
  const slug = (input.slug.trim().toLowerCase() || slugify(title) || "article").slice(0, 80);
  if (!isValidSlug(slug)) throw new ArticleError("The URL can only contain lowercase letters, numbers and hyphens");
  if ((await takenSlugs(row.productId, row.id)).includes(slug)) {
    throw new ArticleError("Another article already uses that URL");
  }
  await assertCategory(row.productId, input.categoryId);
  const summary = input.summary.trim().slice(0, MAX_SUMMARY) || null;
  const changed = row.title !== title || row.bodyMd !== input.bodyMd || (row.summary ?? null) !== summary;

  const now = new Date();
  await db.transaction(async (tx) => {
    if (changed && row.bodyMd.trim()) {
      const [latest] = await tx
        .select({ createdAt: articleVersion.createdAt, authorId: articleVersion.authorId })
        .from(articleVersion)
        .where(eq(articleVersion.articleId, row.id))
        .orderBy(desc(articleVersion.createdAt))
        .limit(1);
      // Snapshot the previous content so it can be restored.
      if (!latest || latest.authorId !== authorId || now.getTime() - latest.createdAt.getTime() > VERSION_INTERVAL_MS) {
        await tx.insert(articleVersion).values({
          id: crypto.randomUUID(),
          articleId: row.id,
          title: row.title,
          summary: row.summary,
          bodyMd: row.bodyMd,
          authorId: row.authorId,
          createdAt: now,
        });
      }
    }
    await tx
      .update(article)
      .set({
        title,
        slug,
        summary,
        bodyMd: input.bodyMd,
        categoryId: input.categoryId,
        authorId: changed ? authorId : row.authorId,
        updatedAt: now,
      })
      .where(eq(article.id, row.id));
  });

  if (row.status === "published") await syncArticleKnowledge(row.id);
  return slug;
}

export async function setArticleStatusRecord(row: ArticleRow, status: "draft" | "published"): Promise<void> {
  if (status === "published" && !row.bodyMd.trim()) throw new ArticleError("Write something before publishing");
  const now = new Date();
  await db
    .update(article)
    .set({ status, publishedAt: status === "published" ? (row.publishedAt ?? now) : row.publishedAt, updatedAt: now })
    .where(eq(article.id, row.id));
  await syncArticleKnowledge(row.id);
  if (status === "published" && row.status !== "published") {
    const center = await getHelpCenterForProduct(row.productId);
    await emitWebhookEvent(row.productId, "article.published", {
      article: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        url: center?.enabled ? helpCenterUrl(center.slug, row.slug) : null,
        publishedAt: (row.publishedAt ?? now).toISOString(),
      },
    });
  }
}

export async function deleteArticleRecord(row: ArticleRow): Promise<void> {
  // Unpublish first so the knowledge base copy is removed.
  await db.update(article).set({ status: "draft" }).where(eq(article.id, row.id));
  await syncArticleKnowledge(row.id);
  await db.delete(article).where(eq(article.id, row.id));
}

export function serializeArticle(row: ArticleRow, publicUrl: string | null) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    bodyMd: row.bodyMd,
    status: row.status,
    categoryId: row.categoryId,
    url: row.status === "published" ? publicUrl : null,
    viewCount: row.viewCount,
    helpfulCount: row.helpfulCount,
    notHelpfulCount: row.notHelpfulCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
