ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "content_hash" text;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp;
