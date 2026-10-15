import { and, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { article } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { ApiInputError, handleApiErrors, optionalString, readJsonObject } from "@/lib/api/http";
import { ArticleError, createArticleRecord, serializeArticle, setArticleStatusRecord } from "@/lib/help-center/articles";
import { articleUrlFor } from "@/lib/help-center/service";

/** GET /api/v1/articles?status=draft|published */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "articles:read");
  if (!isApiContext(ctx)) return ctx;
  const status = new URL(req.url).searchParams.get("status");
  if (status && status !== "draft" && status !== "published") {
    return handleApiErrors(new ApiInputError('status must be "draft" or "published"'));
  }
  const conditions: SQL[] = [eq(article.productId, ctx.productId)];
  if (status) conditions.push(eq(article.status, status));
  const rows = await db.select().from(article).where(and(...conditions)).orderBy(desc(article.updatedAt)).limit(1000);
  const urlFor = await articleUrlFor(ctx.productId);
  return Response.json({ data: rows.map((row) => serializeArticle(row, urlFor(row.slug))) });
}

/** POST /api/v1/articles  { title, bodyMd, summary?, categoryId?, status?: "draft" | "published" } */
export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "articles:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const body = await readJsonObject(req);
    const title = optionalString(body, "title", 500)?.trim();
    if (!title) throw new ApiInputError("title is required");
    if (body.status !== undefined && body.status !== "draft" && body.status !== "published") {
      throw new ApiInputError('status must be "draft" or "published"');
    }
    const id = await createArticleRecord(ctx.productId, null, {
      title,
      bodyMd: optionalString(body, "bodyMd", 200_000) ?? "",
      summary: optionalString(body, "summary", 1000),
      categoryId: optionalString(body, "categoryId", 100) ?? null,
    });
    let row = (await db.query.article.findFirst({ where: eq(article.id, id) }))!;
    if (body.status === "published") {
      await setArticleStatusRecord(row, "published");
      row = (await db.query.article.findFirst({ where: eq(article.id, id) }))!;
    }
    const urlFor = await articleUrlFor(ctx.productId);
    return Response.json({ data: serializeArticle(row, urlFor(row.slug)) }, { status: 201 });
  } catch (error) {
    if (error instanceof ArticleError) return handleApiErrors(new ApiInputError(error.message));
    return handleApiErrors(error);
  }
}
