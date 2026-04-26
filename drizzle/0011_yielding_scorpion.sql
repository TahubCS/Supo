ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "escalation_status" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp;
