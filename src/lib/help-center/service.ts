import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { article, articleCategory, helpCenter, widgetConfig } from "@/db/schema";
import { appUrl } from "@/lib/email";

import { excerpt, stripMarkdown } from "./text";

export type PublicHelpCenter = {
  productId: string;
  productName: string;
  slug: string;
  title: string;
  description: string | null;
  accentColor: string;
};

export function helpCenterUrl(slug: string, articleSlug?: string): string {
  return appUrl(articleSlug ? `/help/${slug}/${articleSlug}` : `/help/${slug}`);
}

/** An enabled help center by its public slug, or null. */
export async function getPublicHelpCenter(slug: string): Promise<PublicHelpCenter | null> {
  const row = await db.query.helpCenter.findFirst({
    where: and(eq(helpCenter.slug, slug), eq(helpCenter.enabled, true)),
    with: { product: { columns: { name: true } } },
  });
  if (!row) return null;
  const widget = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, row.productId),
    columns: { accentColor: true },
  });
  return {
    productId: row.productId,
    productName: row.product.name,
    slug: row.slug,
    title: row.title,
    description: row.description,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(widget?.accentColor ?? "") ? widget!.accentColor : "#18181b",
  };
}

export async function getHelpCenterForProduct(productId: string) {
  return db.query.helpCenter.findFirst({ where: eq(helpCenter.productId, productId) });
}

export type ArticleListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categoryId: string | null;
  updatedAt: Date;
};

function toListItem(row: {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  bodyMd: string;
  categoryId: string | null;
  updatedAt: Date;
}): ArticleListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary?.trim() || excerpt(stripMarkdown(row.bodyMd), 160),
    categoryId: row.categoryId,
    updatedAt: row.updatedAt,
  };
}

const LIST_COLUMNS = {
  id: article.id,
  slug: article.slug,
  title: article.title,
  summary: article.summary,
  bodyMd: article.bodyMd,
  categoryId: article.categoryId,
  updatedAt: article.updatedAt,
};

export async function listPublishedArticles(productId: string, limit = 500): Promise<ArticleListItem[]> {
  const rows = await db
    .select(LIST_COLUMNS)
    .from(article)
    .where(and(eq(article.productId, productId), eq(article.status, "published")))
    .orderBy(asc(article.title))
    .limit(limit);
  return rows.map(toListItem);
}

export async function listPopularArticles(productId: string, limit = 5): Promise<ArticleListItem[]> {
  const rows = await db
    .select(LIST_COLUMNS)
    .from(article)
    .where(and(eq(article.productId, productId), eq(article.status, "published")))
    .orderBy(desc(article.viewCount), desc(article.publishedAt))
    .limit(limit);
  return rows.map(toListItem);
}

export async function listCategories(productId: string) {
  return db
    .select()
    .from(articleCategory)
    .where(eq(articleCategory.productId, productId))
    .orderBy(asc(articleCategory.position), asc(articleCategory.name));
}

export async function getPublishedArticle(productId: string, slug: string) {
  return db.query.article.findFirst({
    where: and(eq(article.productId, productId), eq(article.slug, slug), eq(article.status, "published")),
    with: {
      category: { columns: { id: true, name: true, slug: true } },
      author: { columns: { name: true } },
    },
  });
}

/**
 * Full-text search over published articles (title > summary > body), with a
 * title prefix fallback so partial words ("pass") still find "Password reset".
 */
export async function searchArticles(productId: string, query: string, limit = 10): Promise<ArticleListItem[]> {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const prefix = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const result = await db.execute(sql`
    SELECT id, slug, title, summary, body_md, category_id, updated_at,
           ts_rank(search_tsv, websearch_to_tsquery('english', ${q})) AS rank,
           (title ILIKE ${prefix}) AS title_match
      FROM article
     WHERE product_id = ${productId} AND status = 'published'
       AND (search_tsv @@ websearch_to_tsquery('english', ${q}) OR title ILIKE ${prefix})
     ORDER BY title_match DESC, rank DESC, view_count DESC
     LIMIT ${limit}`);
  return (result.rows as Record<string, unknown>[]).map((row) =>
    toListItem({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      summary: (row.summary as string | null) ?? null,
      bodyMd: String(row.body_md ?? ""),
      categoryId: (row.category_id as string | null) ?? null,
      updatedAt: new Date(`${String(row.updated_at).replace(" ", "T")}Z`),
    }),
  );
}

export async function recordArticleView(articleId: string): Promise<void> {
  await db
    .update(article)
    .set({ viewCount: sql`${article.viewCount} + 1` })
    .where(eq(article.id, articleId));
}

export async function recordArticleFeedback(articleId: string, helpful: boolean): Promise<boolean> {
  const updated = await db
    .update(article)
    .set(
      helpful
        ? { helpfulCount: sql`${article.helpfulCount} + 1` }
        : { notHelpfulCount: sql`${article.notHelpfulCount} + 1` },
    )
    .where(and(eq(article.id, articleId), eq(article.status, "published")))
    .returning({ id: article.id });
  return updated.length > 0;
}
