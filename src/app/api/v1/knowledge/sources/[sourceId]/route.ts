import { eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { notFound } from "@/lib/api/http";
import { findSource, serializeSource } from "@/lib/api/knowledge";

type Params = { params: Promise<{ sourceId: string }> };

/** GET /api/v1/knowledge/sources/{id} */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "knowledge:read");
  if (!isApiContext(ctx)) return ctx;
  const row = await findSource(ctx, (await params).sourceId);
  if (!row) return notFound("Source");
  return Response.json({ data: serializeSource(row) });
}

/** DELETE /api/v1/knowledge/sources/{id} (removes its chunks too) */
export async function DELETE(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "knowledge:write");
  if (!isApiContext(ctx)) return ctx;
  const row = await findSource(ctx, (await params).sourceId);
  if (!row) return notFound("Source");
  await db.delete(knowledgeSource).where(eq(knowledgeSource.id, row.id));
  return new Response(null, { status: 204 });
}
