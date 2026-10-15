-- GitHub App installations linked to workspaces, and GitHub App knowledge sources.
CREATE TABLE IF NOT EXISTS "github_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "installation_id" bigint NOT NULL,
  "account_login" text NOT NULL,
  "account_type" text NOT NULL,
  "account_avatar_url" text,
  "repository_selection" text,
  "suspended_at" timestamp,
  "created_by_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_installation_org_installation_idx" ON "github_installation" ("organization_id", "installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_installation_installation_idx" ON "github_installation" ("installation_id");
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "github_installation_id" bigint;
--> statement-breakpoint
ALTER TABLE "knowledge_source" ADD COLUMN IF NOT EXISTS "github_repo_id" bigint;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_github_repo_idx" ON "knowledge_source" ("github_repo_id") WHERE "github_repo_id" IS NOT NULL;
