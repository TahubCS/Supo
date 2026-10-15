import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { article } from "@/db/schema";
import { authenticateApi, isApiContext, type ApiContext } from "@/lib/api/auth";
import { ApiInputError, handleApiErrors, notFound, optionalString, readJsonObject } from "@/lib/api/http";
import {
  ArticleError,
  deleteArticleRecord,
  serializeArticle,
  setArticleStatusRecord,
  updateArticleRecord,
} from "@/lib/help-center/articles";
import { articleUrlFor } from "@/lib/help-center/service";

type Params = { params: Promise<{ articleId: string }> };

function find(ctx: ApiContext, articleId: string) {
  return db.query.article.findFirst({ where: and(eq(article.id, articleId), eq(article.productId, ctx.productId)) });
}

/** GET /api/v1/articles/{id} */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "articles:read");
  if (!isApiContext(ctx)) return ctx;
  const row = await find(ctx, (await params).articleId);
  if (!row) return notFound("Article");
  return Response.json({ data: serializeArticle(row, (await articleUrlFor(ctx.productId))(row.slug)) });
}

/** PATCH /api/v1/articles/{id}  { title?, slug?, summary?, bodyMd?, categoryId?, status? } */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "articles:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    let row = await find(ctx, (await params).articleId);
    if (!row) return notFound("Article");
    const body = await readJsonObject(req);
    if (body.status !== undefined && body.status !== "draft" && body.status !== "published") {
      throw new ApiInputError('status must be "draft" or "published"');
    }
    const contentKeys = ["title", "slug", "summary", "bodyMd", "categoryId"];
    if (contentKeys.some((key) => body[key] !== undefined)) {
      await updateArticleRecord(row, null, {
        title: optionalString(body, "title", 500) ?? row.title,
        slug: optionalString(body, "slug", 200) ?? row.slug,
        summary: optionalString(body, "summary", 1000) ?? row.summary ?? "",
        bodyMd: optionalString(body, "bodyMd", 200_000) ?? row.bodyMd,
        categoryId: body.categoryId === null ? null : (optionalString(body, "categoryId", 100) ?? row.categoryId),
      });
      row = (await find(ctx, row.id))!;
    }
    if (body.status !== undefined && body.status !== row.status) {
      await setArticleStatusRecord(row, body.status as "draft" | "published");
      row = (await find(ctx, row.id))!;
    }
    return Response.json({ data: serializeArticle(row, (await articleUrlFor(ctx.productId))(row.slug)) });
  } catch (error) {
    if (error instanceof ArticleError) return handleApiErrors(new ApiInputError(error.message));
    return handleApiErrors(error);
  }
}

/** DELETE /api/v1/articles/{id} */
export async function DELETE(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "articles:write");
  if (!isApiContext(ctx)) return ctx;
  const row = await find(ctx, (await params).articleId);
  if (!row) return notFound("Article");
  await deleteArticleRecord(row);
  return new Response(null, { status: 204 });
}
