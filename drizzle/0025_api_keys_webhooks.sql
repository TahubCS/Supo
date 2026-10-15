-- Product API keys (hashed) for the REST API.
CREATE TABLE IF NOT EXISTS "api_key" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_by_id" text REFERENCES "user"("id") ON DELETE set null,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_hash_idx" ON "api_key" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_product_idx" ON "api_key" ("product_id");
--> statement-breakpoint
-- Outgoing webhooks and their delivery log.
CREATE TABLE IF NOT EXISTS "webhook_endpoint" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "description" text,
  "secret" text NOT NULL,
  "events" text[] DEFAULT '{}'::text[] NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "disabled_reason" text,
  "created_by_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_endpoint_product_idx" ON "webhook_endpoint" ("product_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_delivery" (
  "id" text PRIMARY KEY NOT NULL,
  "endpoint_id" text NOT NULL REFERENCES "webhook_endpoint"("id") ON DELETE cascade,
  "event" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "response_status" integer,
  "response_body" text,
  "error" text,
  "duration_ms" integer,
  "created_at" timestamp NOT NULL,
  "delivered_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_delivery_endpoint_created_idx" ON "webhook_delivery" ("endpoint_id", "created_at");
