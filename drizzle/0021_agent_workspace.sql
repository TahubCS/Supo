-- Agent workspace: priority, tags, channel, first response time, routing,
-- macros and a tenant audit log.
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'widget' NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "first_response_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_tags_idx" ON "conversation" USING gin ("tags");
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "routing_mode" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "max_concurrent_chats" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "macro" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "shortcut" text,
  "body" text NOT NULL,
  "actions" jsonb,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "created_by_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "macro_product_idx" ON "macro" ("product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "macro_product_shortcut_idx"
  ON "macro" ("product_id", "shortcut") WHERE "shortcut" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "actor_id" text REFERENCES "user"("id") ON DELETE set null,
  "actor_name" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_audit_log_product_created_idx"
  ON "product_audit_log" ("product_id", "created_at");
--> statement-breakpoint
-- Full-text search across the inbox (customer messages, AI and agent replies).
CREATE INDEX IF NOT EXISTS "message_body_search_idx"
  ON "message" USING gin (to_tsvector('simple', "body"));
