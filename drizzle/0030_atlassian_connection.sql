-- The workspace's Atlassian OAuth grant, and Confluence knowledge sources.
CREATE TABLE IF NOT EXISTS "atlassian_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "scopes" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "atlassian_connection_org_idx" ON "atlassian_connection" ("organization_id");
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "atlassian_connection_id" text REFERENCES "atlassian_connection"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_atlassian_connection_idx" ON "knowledge_source" ("atlassian_connection_id") WHERE "atlassian_connection_id" IS NOT NULL;
