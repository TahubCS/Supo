import { eq } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSource } from "@/db/schema";
import { ingestSource, syncSourceIfChanged } from "@/lib/knowledge/ingest";
// Side-effect import: registers conversation/handoff job handlers.
import "@/lib/handoff/jobs";

import { enqueueAndKick, registerJobHandler } from "./queue";

export { drainJobs, drainSoon, enqueueAndKick, enqueueJob, kickJob, runJobNow } from "./queue";

export const JOB_TYPES = {
  knowledgeIngest: "knowledge.ingest",
  knowledgeSync: "knowledge.sync",
} as const;

function sourceIdFrom(payload: Record<string, unknown>): string {
  const sourceId = payload.sourceId;
  if (typeof sourceId !== "string" || !sourceId) throw new Error("payload.sourceId is required");
  return sourceId;
}

registerJobHandler(JOB_TYPES.knowledgeIngest, async (payload, { isFinalAttempt }) => {
  await ingestSource(sourceIdFrom(payload), { isFinalAttempt });
});

registerJobHandler(JOB_TYPES.knowledgeSync, async (payload, { isFinalAttempt }) => {
  const sourceId = sourceIdFrom(payload);
  try {
    await syncSourceIfChanged(sourceId, { isFinalAttempt });
  } catch (error) {
    if (isFinalAttempt) {
      await db
        .update(knowledgeSource)
        .set({
          errorMessage: `Last sync failed: ${error instanceof Error ? error.message : String(error)}`,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSource.id, sourceId));
    }
    throw error;
  }
});

/** Queues (re)indexing of a knowledge source and starts it after the response. */
export function queueSourceIndexing(sourceId: string): Promise<string> {
  return enqueueAndKick(
    JOB_TYPES.knowledgeIngest,
    { sourceId },
    { dedupeKey: `${JOB_TYPES.knowledgeIngest}:${sourceId}`, maxAttempts: 3 },
  );
}

export function queueSourceSync(sourceId: string): Promise<string> {
  return enqueueAndKick(
    JOB_TYPES.knowledgeSync,
    { sourceId },
    { dedupeKey: `${JOB_TYPES.knowledgeSync}:${sourceId}`, maxAttempts: 2 },
  );
}
