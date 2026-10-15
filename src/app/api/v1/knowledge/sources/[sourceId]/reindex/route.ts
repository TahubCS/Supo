import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { notFound } from "@/lib/api/http";
import { findSource, serializeSource } from "@/lib/api/knowledge";
import { queueSourceIndexing } from "@/lib/jobs";

type Params = { params: Promise<{ sourceId: string }> };

/** POST /api/v1/knowledge/sources/{id}/reindex */
export async function POST(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "knowledge:write");
  if (!isApiContext(ctx)) return ctx;
  const row = await findSource(ctx, (await params).sourceId);
  if (!row) return notFound("Source");
  const now = new Date();
  const [updated] = await db
    .update(knowledgeSource)
    .set({
      revision: sql`${knowledgeSource.revision} + 1`,
      errorMessage: null,
      updatedAt: now,
      // Keep serving the current chunks while a healthy source re-indexes.
      ...(row.status === "indexed" && row.chunkCount > 0 ? {} : { status: "indexing", indexingStartedAt: now }),
    })
    .where(eq(knowledgeSource.id, row.id))
    .returning();
  await queueSourceIndexing(row.id);
  return Response.json({ data: serializeSource(updated) }, { status: 202 });
}
