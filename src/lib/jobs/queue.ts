import { and, eq, lt, sql } from "drizzle-orm";
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

// Periodic checks (e.g. SLA breach warnings) that run whenever the queue is
// drained by cron or opportunistically.
type Sweeper = () => Promise<void>;
const sweepers = new Map<string, Sweeper>();

export function registerSweeper(name: string, sweeper: Sweeper) {
  sweepers.set(name, sweeper);
}

// Sweepers scan tables, so run them at most once a minute per instance even
// when drains are frequent.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

async function runSweepers() {
  if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  for (const [name, sweeper] of sweepers) {
    try {
      await sweeper();
    } catch (error) {
      console.error(`[jobs] sweeper ${name} failed`, error);
    }
  }
}

// Handlers live in feature modules that import this file; load the registry
// lazily (dynamic import avoids a circular import at module load) so a job can
// run from any route, whichever modules that route happened to import.
let registryLoaded: Promise<unknown> | null = null;
function ensureHandlersLoaded(): Promise<unknown> {
  registryLoaded ??= import("./index");
  return registryLoaded;
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

  // A queued job with the same dedupe key already exists; reuse it. (Running
  // jobs are not de-duplicated, so changes made mid-run get a follow-up job.)
  const existing = await db.query.backgroundJob.findFirst({
    where: and(eq(backgroundJob.dedupeKey, options.dedupeKey ?? ""), eq(backgroundJob.status, "queued")),
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

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/**
 * Puts a running job back in the queue. When a follow-up with the same
 * dedupe key is already queued (an edit arrived while this one ran), that
 * follow-up covers the work, so this job is retired instead; re-queueing it
 * would violate the queued-only dedupe index and leave it stuck as running.
 */
async function requeueOrSupersede(jobId: string, values: { runAt: Date; lastError?: string | null }): Promise<"queued" | "superseded"> {
  const now = new Date();
  try {
    const requeued = await db.execute(sql`
      UPDATE background_job AS job
         SET status = 'queued', locked_at = NULL, run_at = ${values.runAt.toISOString()}::timestamp,
             last_error = COALESCE(${values.lastError ?? null}, job.last_error), updated_at = ${now.toISOString()}::timestamp
       WHERE job.id = ${jobId}
         AND (job.dedupe_key IS NULL OR NOT EXISTS (
               SELECT 1 FROM background_job other
                WHERE other.dedupe_key = job.dedupe_key AND other.status = 'queued' AND other.id <> job.id))
      RETURNING job.id`);
    if (requeued.rows.length > 0) return "queued";
  } catch (error) {
    // Lost a race with a follow-up being queued at the same moment.
    if (!isUniqueViolation(error)) throw error;
  }
  await db
    .update(backgroundJob)
    .set({
      status: "done",
      lockedAt: null,
      lastError: "Superseded by a newer queued job with the same dedupe key",
      updatedAt: now,
    })
    .where(eq(backgroundJob.id, jobId));
  return "superseded";
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
    if (isFinalAttempt || !handler) {
      await db
        .update(backgroundJob)
        .set({ status: "failed", lockedAt: null, lastError: message.slice(0, 2000), updatedAt: now() })
        .where(eq(backgroundJob.id, job.id));
      return "failed";
    }
    const requeued = await requeueOrSupersede(job.id, {
      runAt: new Date(Date.now() + retryDelayMs(job.attempts)),
      lastError: message.slice(0, 2000),
    });
    return requeued === "queued" ? "retry" : "done";
  }
}

// Retries short enough to wait for inside the same invocation (the first
// backoff step is 30s), and the total time we allow ourselves to spend.
const INLINE_RETRY_MAX_DELAY_MS = 30_000;
const INLINE_RETRY_BUDGET_MS = 75_000;

/**
 * Claims and runs one specific job if it is due. A failed attempt whose retry
 * is due soon is retried in the same invocation, so transient errors don't
 * wait for the next cron run.
 */
export async function runJobNow(jobId: string): Promise<void> {
  await ensureHandlersLoaded();
  const startedAt = Date.now();
  let job = await claimJob(jobId);
  while (job) {
    const outcome = await executeJob(job);
    if (outcome !== "retry") return;
    const delay = retryDelayMs(job.attempts);
    if (delay > INLINE_RETRY_MAX_DELAY_MS || Date.now() - startedAt + delay > INLINE_RETRY_BUDGET_MS) return;
    await new Promise((resolve) => setTimeout(resolve, delay + 250));
    job = await claimJob(jobId);
  }
}

let lastOpportunisticDrain = 0;

/**
 * Runs a small batch of due jobs after the current response. Called from
 * frequently hit dashboard requests (e.g. indexing status polling) so the
 * queue keeps moving between cron runs. Throttled per server instance.
 */
export function drainSoon({ maxJobs = 2, deadlineMs = 20_000, minIntervalMs = 15_000 } = {}): void {
  const now = Date.now();
  if (now - lastOpportunisticDrain < minIntervalMs) return;
  lastOpportunisticDrain = now;
  const run = () => drainJobs({ maxJobs, deadlineMs }).catch((error) => console.error("[jobs] drain failed", error));
  try {
    after(run);
  } catch {
    void run();
  }
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
  const stale = await db
    .select({ id: backgroundJob.id })
    .from(backgroundJob)
    .where(and(eq(backgroundJob.status, "running"), lt(backgroundJob.lockedAt, cutoff)))
    .limit(100);
  // One at a time: two stale jobs (or a stale job and a queued follow-up) can
  // share a dedupe key, and only one of them may be queued.
  let recovered = 0;
  for (const job of stale) {
    if ((await requeueOrSupersede(job.id, { runAt: new Date() })) === "queued") recovered++;
  }
  return recovered;
}

export async function drainJobs({
  maxJobs = 25,
  deadlineMs = 240_000,
}: { maxJobs?: number; deadlineMs?: number } = {}) {
  const startedAt = Date.now();
  await ensureHandlersLoaded();
  await runSweepers();
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
