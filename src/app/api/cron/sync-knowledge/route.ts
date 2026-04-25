import { and, inArray, isNull, lt, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { env } from "@/lib/env";
import { ingestSourceIfChanged } from "@/lib/knowledge/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== env.BETTER_AUTH_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleThreshold = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23 hours ago

  // Find all auto-syncable sources that haven't been checked recently
  const staleSources = await db.query.knowledgeSource.findMany({
    where: and(
      inArray(knowledgeSource.type, ["url", "github", "sitemap"]),
      or(
        isNull(knowledgeSource.lastCheckedAt),
        lt(knowledgeSource.lastCheckedAt, staleThreshold),
      ),
      // Skip sources currently being indexed
    ),
  });

  // Filter out sources currently indexing (drizzle doesn't have notEq shorthand here)
  const toSync = staleSources.filter((s) => s.status !== "indexing");

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Sequential processing — avoids concurrent embedding API calls hitting rate limits
  for (const source of toSync) {
    const result = await ingestSourceIfChanged(source.id, source.productId);
    if (result === "reindexed") synced++;
    else if (result === "skipped") skipped++;
    else errors++;
  }

  return NextResponse.json({ synced, skipped, errors, total: toSync.length });
}
