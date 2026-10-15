-- Hot-path indexes for the inbox, widget polling and knowledge retrieval.
CREATE INDEX IF NOT EXISTS "message_conversation_created_idx"
  ON "message" ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_product_last_message_idx"
  ON "conversation" ("product_id", "last_message_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_customer_idx"
  ON "conversation" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_product_idx"
  ON "knowledge_source" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_product_idx"
  ON "knowledge_chunk" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_source_idx"
  ON "knowledge_chunk" ("source_id");
--> statement-breakpoint
-- Per-product widget origin allow-list. Empty array = widget may be embedded anywhere.
ALTER TABLE "widget_config"
  ADD COLUMN IF NOT EXISTS "allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL;
