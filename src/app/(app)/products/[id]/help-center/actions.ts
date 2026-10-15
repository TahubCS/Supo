"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { article, articleCategory, articleVersion, helpCenter } from "@/db/schema";
import { recordProductAudit } from "@/lib/audit";
import { resyncPublishedArticles, syncArticleKnowledge } from "@/lib/help-center/sync";
import {
  isValidHelpCenterSlug,
  isValidSlug,
  MAX_ARTICLE_BODY,
  MAX_SUMMARY,
  MAX_TITLE,
  nextAvailableSlug,
  slugify,
} from "@/lib/help-center/text";
import { parseUploadedFile, UploadError } from "@/lib/knowledge/parse-file";
import { requireProductAccess, type ProductAccess } from "@/lib/product-access";

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { value: T })) | { ok: false; error: string };

function requireHelpCenter(productId: string) {
  return requireProductAccess(productId, ["helpCenter"]);
}

async function requireArticle(articleId: string) {
  const row = await db.query.article.findFirst({ where: eq(article.id, articleId) });
  if (!row) throw new Error("Article not found");
  const access = await requireHelpCenter(row.productId);
  return { row, access };
}

function audit(access: ProductAccess, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  return recordProductAudit({
    productId: access.product.id,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action,
    targetType,
    targetId,
    metadata,
  });
}

function revalidate(productId: string) {
  revalidatePath(`/products/${productId}/help-center`, "layout");
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

// ── Settings ───────────────────────────────────────────────────────────────

export type HelpCenterSettingsInput = { enabled: boolean; slug: string; title: string; description: string };

export async function saveHelpCenterSettings(productId: string, input: HelpCenterSettingsInput): Promise<Result> {
  try {
    const access = await requireHelpCenter(productId);
    const slug = input.slug.trim().toLowerCase();
    const title = input.title.trim().slice(0, 120);
    if (!isValidHelpCenterSlug(slug)) {
      return { ok: false, error: "Use 3–60 lowercase letters, numbers and single hyphens for the address." };
    }
    if (!title) return { ok: false, error: "Title is required" };
    const taken = await db.query.helpCenter.findFirst({
      where: and(eq(helpCenter.slug, slug), ne(helpCenter.productId, productId)),
      columns: { productId: true },
    });
    if (taken) return { ok: false, error: "That address is already taken" };

    const before = await db.query.helpCenter.findFirst({ where: eq(helpCenter.productId, productId) });
    const now = new Date();
    const values = {
      enabled: input.enabled,
      slug,
      title,
      description: input.description.trim().slice(0, 300) || null,
      updatedAt: now,
    };
    await db
      .insert(helpCenter)
      .values({ productId, ...values, createdAt: now })
      .onConflictDoUpdate({ target: helpCenter.productId, set: values });

    // Article URLs (used in AI citations) depend on the slug and visibility.
    if (!before || before.slug !== slug || before.enabled !== input.enabled) {
      await resyncPublishedArticles(productId);
    }
    await audit(access, "help_center.settings_updated", "help_center", productId, { enabled: input.enabled, slug });
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function saveCategory(
  productId: string,
  input: { id?: string; name: string; description?: string },
): Promise<Result<string>> {
  try {
    const access = await requireHelpCenter(productId);
    const name = input.name.trim().slice(0, 80);
    if (!name) return { ok: false, error: "Name is required" };
    const existing = await db
      .select({ id: articleCategory.id, slug: articleCategory.slug })
      .from(articleCategory)
      .where(eq(articleCategory.productId, productId));
    const now = new Date();
    if (input.id) {
      const current = existing.find((c) => c.id === input.id);
      if (!current) return { ok: false, error: "Category not found" };
      const slug = nextAvailableSlug(slugify(name) || "category", existing.filter((c) => c.id !== input.id).map((c) => c.slug));
      await db
        .update(articleCategory)
        .set({ name, slug, description: input.description?.trim().slice(0, 300) || null, updatedAt: now })
        .where(eq(articleCategory.id, input.id));
      await audit(access, "help_center.category_updated", "article_category", input.id, { name });
      revalidate(productId);
      return { ok: true, value: input.id };
    }
    const id = crypto.randomUUID();
    await db.insert(articleCategory).values({
      id,
      productId,
      name,
      slug: nextAvailableSlug(slugify(name) || "category", existing.map((c) => c.slug)),
      description: input.description?.trim().slice(0, 300) || null,
      position: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    await audit(access, "help_center.category_created", "article_category", id, { name });
    revalidate(productId);
    return { ok: true, value: id };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function deleteCategory(productId: string, categoryId: string): Promise<Result> {
  try {
    const access = await requireHelpCenter(productId);
    // Articles keep existing and become uncategorized (ON DELETE SET NULL).
    await db
      .delete(articleCategory)
      .where(and(eq(articleCategory.id, categoryId), eq(articleCategory.productId, productId)));
    await audit(access, "help_center.category_deleted", "article_category", categoryId);
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function moveCategory(productId: string, categoryId: string, direction: "up" | "down"): Promise<Result> {
  try {
    await requireHelpCenter(productId);
    const rows = await db
      .select({ id: articleCategory.id })
      .from(articleCategory)
      .where(eq(articleCategory.productId, productId))
      .orderBy(articleCategory.position, articleCategory.name);
    const index = rows.findIndex((r) => r.id === categoryId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return { ok: true };
    [rows[index], rows[target]] = [rows[target], rows[index]];
    await db.transaction(async (tx) => {
      for (const [position, row] of rows.entries()) {
        await tx.update(articleCategory).set({ position }).where(eq(articleCategory.id, row.id));
      }
    });
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Articles ───────────────────────────────────────────────────────────────

async function takenSlugs(productId: string, excludeId?: string) {
  const rows = await db
    .select({ slug: article.slug })
    .from(article)
    .where(excludeId ? and(eq(article.productId, productId), ne(article.id, excludeId)) : eq(article.productId, productId));
  return rows.map((r) => r.slug);
}

export async function createArticle(
  productId: string,
  input: { title?: string; bodyMd?: string; categoryId?: string | null } = {},
): Promise<Result<string>> {
  try {
    const access = await requireHelpCenter(productId);
    const title = (input.title?.trim() || "Untitled article").slice(0, MAX_TITLE);
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(article).values({
      id,
      productId,
      categoryId: input.categoryId ?? null,
      title,
      slug: nextAvailableSlug(slugify(title) || "article", await takenSlugs(productId)),
      bodyMd: (input.bodyMd ?? "").slice(0, MAX_ARTICLE_BODY),
      status: "draft",
      authorId: access.session.user.id,
      createdAt: now,
      updatedAt: now,
    });
    await audit(access, "help_center.article_created", "article", id, { title });
    revalidate(productId);
    return { ok: true, value: id };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export type ArticleInput = {
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  categoryId: string | null;
};

// A new version snapshot is kept at most this often while someone is editing.
const VERSION_INTERVAL_MS = 10 * 60 * 1000;

export async function saveArticle(articleId: string, input: ArticleInput): Promise<Result<{ slug: string }>> {
  try {
    const { row, access } = await requireArticle(articleId);
    const title = input.title.trim().slice(0, MAX_TITLE);
    if (!title) return { ok: false, error: "Title is required" };
    if (input.bodyMd.length > MAX_ARTICLE_BODY) {
      return { ok: false, error: `Articles are limited to ${MAX_ARTICLE_BODY.toLocaleString()} characters` };
    }
    const slug = (input.slug.trim().toLowerCase() || slugify(title) || "article").slice(0, 80);
    if (!isValidSlug(slug)) return { ok: false, error: "The URL can only contain lowercase letters, numbers and hyphens" };
    if ((await takenSlugs(row.productId, row.id)).includes(slug)) {
      return { ok: false, error: "Another article already uses that URL" };
    }
    if (input.categoryId) {
      const category = await db.query.articleCategory.findFirst({
        where: and(eq(articleCategory.id, input.categoryId), eq(articleCategory.productId, row.productId)),
        columns: { id: true },
      });
      if (!category) return { ok: false, error: "Category not found" };
    }
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
        if (!latest || latest.authorId !== access.session.user.id || now.getTime() - latest.createdAt.getTime() > VERSION_INTERVAL_MS) {
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
          authorId: changed ? access.session.user.id : row.authorId,
          updatedAt: now,
        })
        .where(eq(article.id, row.id));
    });

    if (row.status === "published") await syncArticleKnowledge(row.id);
    revalidate(row.productId);
    return { ok: true, value: { slug } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function setArticleStatus(articleId: string, status: "draft" | "published"): Promise<Result> {
  try {
    const { row, access } = await requireArticle(articleId);
    if (status === "published" && !row.bodyMd.trim()) {
      return { ok: false, error: "Write something before publishing" };
    }
    const now = new Date();
    await db
      .update(article)
      .set({ status, publishedAt: status === "published" ? (row.publishedAt ?? now) : row.publishedAt, updatedAt: now })
      .where(eq(article.id, row.id));
    await syncArticleKnowledge(row.id);
    await audit(access, status === "published" ? "help_center.article_published" : "help_center.article_unpublished", "article", row.id, {
      title: row.title,
    });
    revalidate(row.productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function deleteArticle(articleId: string): Promise<Result> {
  try {
    const { row, access } = await requireArticle(articleId);
    // Unpublish first so the knowledge base copy is removed.
    await db.update(article).set({ status: "draft" }).where(eq(article.id, row.id));
    await syncArticleKnowledge(row.id);
    await db.delete(article).where(eq(article.id, row.id));
    await audit(access, "help_center.article_deleted", "article", row.id, { title: row.title });
    revalidate(row.productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function restoreArticleVersion(articleId: string, versionId: string): Promise<Result> {
  try {
    const { row, access } = await requireArticle(articleId);
    const version = await db.query.articleVersion.findFirst({
      where: and(eq(articleVersion.id, versionId), eq(articleVersion.articleId, row.id)),
    });
    if (!version) return { ok: false, error: "Version not found" };
    const result = await saveArticle(row.id, {
      title: version.title,
      slug: row.slug,
      summary: version.summary ?? "",
      bodyMd: version.bodyMd,
      categoryId: row.categoryId,
    });
    if (!result.ok) return result;
    await audit(access, "help_center.article_restored", "article", row.id, { versionId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Creates a draft article from an uploaded document (PDF, Word, Markdown, …). */
export async function importArticleFromFile(productId: string, formData: FormData): Promise<Result<string>> {
  try {
    await requireHelpCenter(productId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Choose a file to import" };
    const parsed = await parseUploadedFile(file.name, new Uint8Array(await file.arrayBuffer()));
    return await createArticle(productId, { title: parsed.title, bodyMd: parsed.text });
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: message(error) };
  }
}

export async function getArticleStats(productId: string) {
  await requireHelpCenter(productId);
  const [row] = await db
    .select({
      published: sql<number>`count(*) FILTER (WHERE ${article.status} = 'published')::int`,
      drafts: sql<number>`count(*) FILTER (WHERE ${article.status} = 'draft')::int`,
      views: sql<number>`coalesce(sum(${article.viewCount}), 0)::int`,
      helpful: sql<number>`coalesce(sum(${article.helpfulCount}), 0)::int`,
      notHelpful: sql<number>`coalesce(sum(${article.notHelpfulCount}), 0)::int`,
    })
    .from(article)
    .where(eq(article.productId, productId));
  return row;
}
