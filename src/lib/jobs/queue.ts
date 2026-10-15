import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { backgroundJob } from "@/db/schema";

// Postgres-backed job queue.
//
// - enqueueJob() inserts a row (optionally de-duplicated by key)
// - kickJob() runs it right after the current response via next/server after()
// - drainJobs() (cron) picks up anything queued, retried or recovered
// Jobs are claimed with FOR UPDATE SKIP LOCKED, so concurrent runners never
// execute the same job twice.

export type JobRow = typeof backgroundJob.$inferSelect;

export type JobContext = {
  job: JobRow;
  attempt: number;
  isFinalAttempt: boolean;
};

export type JobHandler = (payload: Record<string, unknown>, context: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

// Lock older than this is treated as a crashed/timed-out runner.
const STALE_LOCK_MS = 10 * 60 * 1000;

export function retryDelayMs(attempt: number): number {
  // 30s, 2m, 8m, 32m, ... capped at 2h
  return Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 2 * 60 * 60 * 1000);
}

export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  options: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<string> {
  const now = new Date();
  const id = crypto.randomUUID();

  const inserted = await db
    .insert(backgroundJob)
    .values({
      id,
      type,
      payload,
      status: "queued",
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 5,
      runAt: options.runAt ?? now,
      dedupeKey: options.dedupeKey ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: backgroundJob.id });

  if (inserted.length > 0) return inserted[0].id;

  // An active job with the same dedupe key already exists; reuse it.
  const existing = await db.query.backgroundJob.findFirst({
    where: and(
      eq(backgroundJob.dedupeKey, options.dedupeKey ?? ""),
      inArray(backgroundJob.status, ["queued", "running"]),
    ),
    columns: { id: true },
  });
  if (!existing) throw new Error(`Could not enqueue ${type} job`);
  return existing.id;
}

async function claimJob(jobId?: string): Promise<JobRow | null> {
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    UPDATE background_job
       SET status = 'running', locked_at = ${now}::timestamp, attempts = attempts + 1, updated_at = ${now}::timestamp
     WHERE id = (
       SELECT id FROM background_job
        WHERE status = 'queued'
          AND run_at <= ${now}::timestamp
          ${jobId ? sql`AND id = ${jobId}` : sql``}
        ORDER BY run_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id`);

  const claimedId = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!claimedId) return null;
  return (await db.query.backgroundJob.findFirst({ where: eq(backgroundJob.id, claimedId) })) ?? null;
}

async function executeJob(job: JobRow): Promise<"done" | "retry" | "failed"> {
  const handler = handlers.get(job.type);
  const isFinalAttempt = job.attempts >= job.maxAttempts;
  const now = () => new Date();

  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    await handler(job.payload, { job, attempt: job.attempts, isFinalAttempt });
    await db
      .update(backgroundJob)
      .set({ status: "done", lockedAt: null, lastError: null, updatedAt: now() })
      .where(eq(backgroundJob.id, job.id));
    return "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] ${job.type} ${job.id} attempt ${job.attempts} failed: ${message}`);
    await db
      .update(backgroundJob)
      .set(
        isFinalAttempt || !handler
          ? { status: "failed", lockedAt: null, lastError: message.slice(0, 2000), updatedAt: now() }
          : {
              status: "queued",
              lockedAt: null,
              lastError: message.slice(0, 2000),
              runAt: new Date(Date.now() + retryDelayMs(job.attempts)),
              updatedAt: now(),
            },
      )
      .where(eq(backgroundJob.id, job.id));
    return isFinalAttempt || !handler ? "failed" : "retry";
  }
}

/** Claims and runs one specific job if it is due. */
export async function runJobNow(jobId: string): Promise<void> {
  const job = await claimJob(jobId);
  if (job) await executeJob(job);
}

/**
 * Runs a job right after the current request finishes (Vercel keeps the
 * function alive for `after()` work). If the function is killed, the cron
 * drain picks the job up again.
 */
export function kickJob(jobId: string): void {
  try {
    after(() => runJobNow(jobId).catch((error) => console.error("[jobs] kick failed", error)));
  } catch {
    // Outside a request scope (scripts/tests): run detached.
    void runJobNow(jobId).catch((error) => console.error("[jobs] kick failed", error));
  }
}

export async function enqueueAndKick(
  type: string,
  payload: Record<string, unknown>,
  options?: Parameters<typeof enqueueJob>[2],
): Promise<string> {
  const id = await enqueueJob(type, payload, options);
  kickJob(id);
  return id;
}

/** Re-queues jobs whose runner died mid-flight. */
export async function recoverStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  const recovered = await db
    .update(backgroundJob)
    .set({ status: "queued", lockedAt: null, runAt: new Date(), updatedAt: new Date() })
    .where(and(eq(backgroundJob.status, "running"), lt(backgroundJob.lockedAt, cutoff)))
    .returning({ id: backgroundJob.id });
  return recovered.length;
}

export async function drainJobs({
  maxJobs = 25,
  deadlineMs = 240_000,
}: { maxJobs?: number; deadlineMs?: number } = {}) {
  const startedAt = Date.now();
  const recovered = await recoverStaleJobs();
  const results = { recovered, done: 0, retried: 0, failed: 0 };

  for (let i = 0; i < maxJobs && Date.now() - startedAt < deadlineMs; i++) {
    const job = await claimJob();
    if (!job) break;
    const outcome = await executeJob(job);
    if (outcome === "done") results.done++;
    else if (outcome === "retry") results.retried++;
    else results.failed++;
  }

  return results;
}
