-- Email channel: one inbound address per product.
CREATE TABLE IF NOT EXISTS "email_channel" (
  "product_id" text PRIMARY KEY NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "enabled" boolean DEFAULT true NOT NULL,
  "address_local" text NOT NULL,
  "from_name" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_channel_address_idx" ON "email_channel" ("address_local");
--> statement-breakpoint
-- RFC 5322 Message-ID of emailed messages (inbound and outbound), for threading and de-duplication.
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "email_message_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_email_message_id_idx" ON "message" ("conversation_id", "email_message_id")
  WHERE "email_message_id" IS NOT NULL;
--> statement-breakpoint
-- Data retention: resolved conversations older than this many days are deleted (NULL = keep forever).
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "data_retention_days" integer;
