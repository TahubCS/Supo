import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { drainJobs, enqueueJob, JOB_TYPES } from "@/lib/jobs";
import { STUCK_INDEXING_MS } from "@/lib/knowledge/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const AUTO_SYNC_TYPES = ["url", "github", "sitemap", "website"];

export async function GET(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const staleThreshold = new Date(now - 23 * 60 * 60 * 1000);
  const stuckThreshold = new Date(now - STUCK_INDEXING_MS);

  // 1. Sources stuck in "indexing"/"pending" (runner died, or created before the
  //    job queue existed) get a fresh indexing job.
  const stuck = await db.query.knowledgeSource.findMany({
    where: and(
      inArray(knowledgeSource.status, ["indexing", "pending"]),
      or(isNull(knowledgeSource.indexingStartedAt), lt(knowledgeSource.indexingStartedAt, stuckThreshold)),
    ),
    columns: { id: true },
  });
  for (const source of stuck) {
    await enqueueJob(
      JOB_TYPES.knowledgeIngest,
      { sourceId: source.id },
      { dedupeKey: `${JOB_TYPES.knowledgeIngest}:${source.id}`, maxAttempts: 3 },
    );
  }

  // 2. Auto-syncable sources not checked in the last day are re-fetched and
  //    re-embedded only if their content changed.
  const stale = await db.query.knowledgeSource.findMany({
    where: and(
      inArray(knowledgeSource.type, AUTO_SYNC_TYPES),
      eq(knowledgeSource.status, "indexed"),
      or(isNull(knowledgeSource.lastCheckedAt), lt(knowledgeSource.lastCheckedAt, staleThreshold)),
    ),
    columns: { id: true },
  });
  for (const source of stale) {
    await enqueueJob(
      JOB_TYPES.knowledgeSync,
      { sourceId: source.id },
      { dedupeKey: `${JOB_TYPES.knowledgeSync}:${source.id}`, maxAttempts: 2 },
    );
  }

  // 3. Work through the queue within this invocation's time budget; anything
  //    left over is picked up by /api/cron/jobs.
  const drained = await drainJobs({ maxJobs: 100, deadlineMs: 240_000 });

  return NextResponse.json({ requeuedStuck: stuck.length, queuedSyncs: stale.length, ...drained });
}
