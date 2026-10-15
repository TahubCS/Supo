"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { article, articleCategory, articleVersion, helpCenter } from "@/db/schema";
import { recordProductAudit } from "@/lib/audit";
import {
  createArticleRecord,
  deleteArticleRecord,
  setArticleStatusRecord,
  updateArticleRecord,
  type ArticleInput,
} from "@/lib/help-center/articles";
import { resyncPublishedArticles } from "@/lib/help-center/sync";
import { isValidHelpCenterSlug, nextAvailableSlug, slugify } from "@/lib/help-center/text";
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

export async function createArticle(
  productId: string,
  input: { title?: string; bodyMd?: string; categoryId?: string | null } = {},
): Promise<Result<string>> {
  try {
    const access = await requireHelpCenter(productId);
    const id = await createArticleRecord(productId, access.session.user.id, input);
    await audit(access, "help_center.article_created", "article", id, { title: input.title });
    revalidate(productId);
    return { ok: true, value: id };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function saveArticle(articleId: string, input: ArticleInput): Promise<Result<{ slug: string }>> {
  try {
    const { row, access } = await requireArticle(articleId);
    const slug = await updateArticleRecord(row, access.session.user.id, input);
    revalidate(row.productId);
    return { ok: true, value: { slug } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function setArticleStatus(articleId: string, status: "draft" | "published"): Promise<Result> {
  try {
    const { row, access } = await requireArticle(articleId);
    await setArticleStatusRecord(row, status);
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
    await deleteArticleRecord(row);
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
    await updateArticleRecord(row, access.session.user.id, {
      title: version.title,
      slug: row.slug,
      summary: version.summary ?? "",
      bodyMd: version.bodyMd,
      categoryId: row.categoryId,
    });
    await audit(access, "help_center.article_restored", "article", row.id, { versionId });
    revalidate(row.productId);
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
