import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { article, articleCategory, articleVersion, knowledgeSource, user } from "@/db/schema";
import { getHelpCenterForProduct, helpCenterUrl } from "@/lib/help-center/service";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { ArticleEditor } from "./ArticleEditor";

export default async function ArticleEditorPage({ params }: { params: Promise<{ id: string; articleId: string }> }) {
  const { id, articleId } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "helpCenter")) notFound();

  const row = await db.query.article.findFirst({
    where: and(eq(article.id, articleId), eq(article.productId, id)),
  });
  if (!row) notFound();

  const [categories, versions, center, source] = await Promise.all([
    db
      .select({ id: articleCategory.id, name: articleCategory.name })
      .from(articleCategory)
      .where(eq(articleCategory.productId, id))
      .orderBy(asc(articleCategory.position), asc(articleCategory.name)),
    db
      .select({ id: articleVersion.id, title: articleVersion.title, createdAt: articleVersion.createdAt, authorName: user.name })
      .from(articleVersion)
      .leftJoin(user, eq(user.id, articleVersion.authorId))
      .where(eq(articleVersion.articleId, row.id))
      .orderBy(desc(articleVersion.createdAt))
      .limit(25),
    getHelpCenterForProduct(id),
    row.knowledgeSourceId
      ? db.query.knowledgeSource.findFirst({
          where: eq(knowledgeSource.id, row.knowledgeSourceId),
          columns: { status: true, chunkCount: true, errorMessage: true },
        })
      : Promise.resolve(undefined),
  ]);

  return (
    <ArticleEditor
      productId={id}
      article={{
        id: row.id,
        title: row.title,
        slug: row.slug,
        summary: row.summary ?? "",
        bodyMd: row.bodyMd,
        categoryId: row.categoryId,
        status: row.status === "published" ? "published" : "draft",
        updatedAt: row.updatedAt,
      }}
      categories={categories}
      versions={versions}
      publicUrlBase={center?.enabled ? helpCenterUrl(center.slug) : null}
      knowledge={source ?? null}
    />
  );
}
