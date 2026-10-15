import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { ApiInputError, apiError, handleApiErrors, optionalString, readJsonObject } from "@/lib/api/http";
import { serializeSource } from "@/lib/api/knowledge";
import { queueSourceIndexing } from "@/lib/jobs";
import { validateSourceInput, type AddSourceInput } from "@/lib/knowledge/sources";
import { isSecurityQuotaError, requireSecurityQuota } from "@/lib/security";

const TYPES: AddSourceInput["type"][] = ["article", "url", "website", "github"];

/** GET /api/v1/knowledge/sources */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "knowledge:read");
  if (!isApiContext(ctx)) return ctx;
  const rows = await db
    .select()
    .from(knowledgeSource)
    .where(eq(knowledgeSource.productId, ctx.productId))
    .orderBy(desc(knowledgeSource.createdAt))
    .limit(1000);
  return Response.json({ data: rows.map(serializeSource) });
}

/** POST /api/v1/knowledge/sources  { type, name, content? (article), url? , maxPages? (website) } */
export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "knowledge:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const body = await readJsonObject(req);
    const type = body.type as AddSourceInput["type"];
    if (!TYPES.includes(type)) throw new ApiInputError(`type must be one of ${TYPES.join(", ")}`);
    let values: ReturnType<typeof validateSourceInput>;
    try {
      values = validateSourceInput({
        type,
        name: optionalString(body, "name", 500) ?? "",
        url: optionalString(body, "url", 2000),
        content: optionalString(body, "content", 250_000),
        maxPages: typeof body.maxPages === "number" ? body.maxPages : undefined,
      });
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "Invalid source");
    }

    try {
      await requireSecurityQuota("knowledge.source.organization.day", ctx.organizationId, {
        organizationId: ctx.organizationId,
        productId: ctx.productId,
        headerList: req.headers,
        path: "/api/v1/knowledge/sources",
        method: "POST",
      });
    } catch (error) {
      if (isSecurityQuotaError(error)) return apiError(429, "rate_limited", error.message);
      throw error;
    }

    const now = new Date();
    const [row] = await db
      .insert(knowledgeSource)
      .values({
        id: crypto.randomUUID(),
        productId: ctx.productId,
        type,
        name: values.name,
        url: values.url,
        content: values.content,
        settings: values.settings,
        status: "indexing",
        indexingStartedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await queueSourceIndexing(row.id);
    return Response.json({ data: serializeSource(row) }, { status: 201 });
  } catch (error) {
    return handleApiErrors(error);
  }
}
