-- Source revision: edits made while an ingest job is running must not be
-- overwritten by that (older) job; the job skips its swap if the revision moved.
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- De-duplicate only queued jobs, so a change made while a job is running
-- always enqueues a follow-up run.
DROP INDEX IF EXISTS "background_job_active_dedupe_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_job_queued_dedupe_idx"
  ON "background_job" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL AND "status" = 'queued';
