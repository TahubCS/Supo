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

ALTER TABLE "product_member"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp;

UPDATE "product_member"
SET "updated_at" = COALESCE("updated_at", "created_at", NOW())
WHERE "updated_at" IS NULL;

ALTER TABLE "product_member"
  ALTER COLUMN "updated_at" SET NOT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'product_member'
      AND column_name = 'role'
      AND data_type <> 'USER-DEFINED'
  ) THEN
    ALTER TABLE "product_member"
      ALTER COLUMN "role" TYPE "product_role"
      USING "role"::"product_role";
  END IF;
END $$;

ALTER TABLE "product_invitation"
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp;

ALTER TABLE "product_invitation"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp;

UPDATE "product_invitation"
SET "updated_at" = COALESCE("updated_at", "created_at", NOW())
WHERE "updated_at" IS NULL;

ALTER TABLE "product_invitation"
  ALTER COLUMN "updated_at" SET NOT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'product_invitation'
      AND column_name = 'role'
      AND data_type <> 'USER-DEFINED'
  ) THEN
    ALTER TABLE "product_invitation"
      ALTER COLUMN "role" TYPE "product_role"
      USING "role"::"product_role";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'product_invitation'
      AND column_name = 'status'
      AND data_type <> 'USER-DEFINED'
  ) THEN
    ALTER TABLE "product_invitation"
      ALTER COLUMN "status" TYPE "product_invitation_status"
      USING "status"::"product_invitation_status";
  END IF;
END $$;
