-- Durable background jobs (knowledge indexing and other async work).
CREATE TABLE IF NOT EXISTS "background_job" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "run_at" timestamp NOT NULL,
  "locked_at" timestamp,
  "last_error" text,
  "dedupe_key" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_job_status_run_at_idx"
  ON "background_job" ("status", "run_at");
--> statement-breakpoint
-- At most one queued/running job per dedupe key (e.g. one indexing job per source).
CREATE UNIQUE INDEX IF NOT EXISTS "background_job_active_dedupe_idx"
  ON "background_job" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL AND "status" IN ('queued', 'running');
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "indexing_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "page_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "settings" jsonb;
--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD COLUMN IF NOT EXISTS "embedding_model" text;
--> statement-breakpoint
-- Keyword search for hybrid retrieval (exact product names, error codes, SKUs).
ALTER TABLE "knowledge_chunk" ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_content_tsv_idx"
  ON "knowledge_chunk" USING gin ("content_tsv");
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ADD COLUMN IF NOT EXISTS "hits" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "sources" jsonb;
--> statement-breakpoint
-- Sources left in "indexing" by the old fire-and-forget pipeline are re-queued by
-- the job runner; mark them so the stuck-source recovery picks them up.
UPDATE "knowledge_source" SET "indexing_started_at" = "updated_at"
WHERE "status" IN ('indexing', 'pending') AND "indexing_started_at" IS NULL;
