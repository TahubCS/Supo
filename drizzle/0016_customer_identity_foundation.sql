ALTER TABLE "customer"
  ADD COLUMN IF NOT EXISTS "external_id" text,
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "avatar_url" text,
  ADD COLUMN IF NOT EXISTS "locale" text,
  ADD COLUMN IF NOT EXISTS "timezone" text,
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp;

UPDATE "customer"
SET "updated_at" = COALESCE("updated_at", "created_at", now())
WHERE "updated_at" IS NULL;

ALTER TABLE "customer"
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_org_external_id_idx"
  ON "customer" ("organization_id", "external_id")
  WHERE "external_id" IS NOT NULL;
