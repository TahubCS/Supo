import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";

import type { ApiContext } from "./auth";

export type SourceRow = typeof knowledgeSource.$inferSelect;

export function serializeSource(row: SourceRow) {
  return {
    id: row.id,
    type: row.type === "sitemap" ? "website" : row.type,
    name: row.name,
    url: row.url,
    status: row.status,
    enabled: row.enabled,
    chunkCount: row.chunkCount,
    pageCount: row.pageCount,
    errorMessage: row.errorMessage,
    maxPages: row.settings?.maxPages ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findSource(ctx: ApiContext, sourceId: string) {
  return db.query.knowledgeSource.findFirst({
    where: and(eq(knowledgeSource.id, sourceId), eq(knowledgeSource.productId, ctx.productId)),
  });
}
