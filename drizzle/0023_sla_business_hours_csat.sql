-- SLA targets on conversations.
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "first_response_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "resolution_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "sla_warning_sent_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_first_response_due_idx"
  ON "conversation" ("first_response_due_at")
  WHERE "first_response_at" IS NULL AND "first_response_due_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "widget_config" ADD COLUMN IF NOT EXISTS "csat_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_hours" (
  "product_id" text PRIMARY KEY NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "enabled" boolean DEFAULT false NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "schedule" jsonb NOT NULL,
  "holidays" text[] DEFAULT '{}'::text[] NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_policy" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "priority" text NOT NULL,
  "first_response_minutes" integer NOT NULL,
  "resolution_minutes" integer,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sla_policy_product_priority_idx" ON "sla_policy" ("product_id", "priority");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_rating" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL UNIQUE REFERENCES "conversation"("id") ON DELETE cascade,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "agent_id" text REFERENCES "user"("id") ON DELETE set null,
  "score" integer NOT NULL,
  "comment" text,
  "created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_rating_product_created_idx" ON "conversation_rating" ("product_id", "created_at");
--> statement-breakpoint
-- Breach-warning sweeper: open first-response targets that nobody was warned about.
CREATE INDEX IF NOT EXISTS "conversation_sla_due_idx" ON "conversation" ("first_response_due_at")
  WHERE "first_response_at" IS NULL AND "sla_warning_sent_at" IS NULL;
