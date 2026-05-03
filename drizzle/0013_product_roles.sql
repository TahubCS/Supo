CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "product_member" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamp NOT NULL
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
  "role" text NOT NULL,
  "status" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_invitation_product_email_idx"
  ON "product_invitation" ("product_id", "email");
CREATE INDEX IF NOT EXISTS "product_invitation_product_status_idx"
  ON "product_invitation" ("product_id", "status");
CREATE INDEX IF NOT EXISTS "product_invitation_email_idx"
  ON "product_invitation" ("email");

INSERT INTO "product_member" ("id", "product_id", "user_id", "role", "created_at")
SELECT
  gen_random_uuid()::text,
  p."id",
  m."user_id",
  CASE
    WHEN m."role" IN ('owner', 'admin') THEN 'admin'
    ELSE 'agent'
  END,
  NOW()
FROM "product" p
JOIN "member" m ON m."organization_id" = p."organization_id"
ON CONFLICT ("product_id", "user_id") DO NOTHING;
