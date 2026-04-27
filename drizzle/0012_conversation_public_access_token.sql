CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "public_access_token" text;--> statement-breakpoint
UPDATE "conversation"
SET "public_access_token" = encode(gen_random_bytes(32), 'hex')
WHERE "public_access_token" IS NULL;--> statement-breakpoint
ALTER TABLE "conversation" ALTER COLUMN "public_access_token" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_public_access_token_idx"
ON "conversation" ("public_access_token");
