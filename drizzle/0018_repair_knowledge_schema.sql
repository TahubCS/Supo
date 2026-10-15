-- Repair migration. Journal entries 0002-0005 were recorded with timestamps
-- older than 0001, and drizzle's migrator only applies migrations newer than
-- the last applied one. Databases first migrated at 0001 may therefore have
-- skipped the knowledge-base schema. Every statement here is idempotent.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "embedding_model" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_source" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "url" text,
  "content" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "chunk_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunk" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text NOT NULL REFERENCES "knowledge_source"("id") ON DELETE cascade,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "content" text NOT NULL,
  "embedding" vector(768),
  "metadata" text,
  "created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "content_hash" text;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_embedding_idx"
  ON "knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_product_idx"
  ON "knowledge_source" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_product_idx"
  ON "knowledge_chunk" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_source_idx"
  ON "knowledge_chunk" ("source_id");
