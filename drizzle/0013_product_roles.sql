CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "product_role" AS ENUM ('admin', 'developer', 'agent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "product_invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_member" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" "product_role" NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_member_product_user_idx"
  ON "product_member" ("product_id", "user_id");
CREATE INDEX IF NOT EXISTS "product_member_user_idx"
  ON "product_member" ("user_id");
CREATE INDEX IF NOT EXISTS "product_member_product_role_idx"
  ON "product_member" ("product_id", "role");

CREATE TABLE IF NOT EXISTS "product_invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "product_role" NOT NULL,
  "status" "product_invitation_status" NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_invitation_product_email_idx"
  ON "product_invitation" ("product_id", "email");
CREATE INDEX IF NOT EXISTS "product_invitation_product_status_idx"
  ON "product_invitation" ("product_id", "status");
CREATE INDEX IF NOT EXISTS "product_invitation_email_idx"
  ON "product_invitation" ("email");

INSERT INTO "product_member" ("id", "product_id", "user_id", "role", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  p."id",
  m."user_id",
  CASE
    WHEN m."role" IN ('owner', 'admin') THEN 'admin'::"product_role"
    ELSE 'agent'::"product_role"
  END,
  NOW(),
  NOW()
FROM "product" p
JOIN "member" m ON m."organization_id" = p."organization_id"
ON CONFLICT ("product_id", "user_id") DO NOTHING;
