-- Human handoff: conversation handoff state, assignment history and follow-up.
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "handoff_reason" text;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "unanswered_streak" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "ai_summary" text;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "handoff_timeout_notified_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "follow_up_email" text;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "customer_last_seen_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "customer_notified_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "identity_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "resolved_by_id" text REFERENCES "user"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_product_escalation_idx"
  ON "conversation" ("product_id", "escalation_status")
  WHERE "escalation_status" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_assignee_idx"
  ON "conversation" ("assignee_id")
  WHERE "assignee_id" IS NOT NULL;
--> statement-breakpoint
-- Lossless polling cursor. bigserial backfills existing rows.
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "seq" bigserial NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_conversation_seq_idx" ON "message" ("conversation_id", "seq");
--> statement-breakpoint
ALTER TABLE "widget_config" ADD COLUMN IF NOT EXISTS "handoff_timeout_sec" integer DEFAULT 300 NOT NULL;
--> statement-breakpoint
ALTER TABLE "widget_config" ADD COLUMN IF NOT EXISTS "identity_secret" text;
--> statement-breakpoint
ALTER TABLE "widget_config" ADD COLUMN IF NOT EXISTS "identity_verification" text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
-- Escalations created by the old "no knowledge matched" rule locked customers out
-- of the AI. Release stale, unclaimed ones so the bot can help again.
UPDATE "conversation"
   SET "escalation_status" = NULL, "ai_handled" = true
 WHERE "escalation_status" = 'pending'
   AND "assignee_id" IS NULL
   AND "escalated_at" < now() - interval '1 day';
