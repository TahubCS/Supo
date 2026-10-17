-- Better Auth 1.7's organization plugin requires invitation.created_at and
-- rejects auth requests while the column is missing from the schema.
ALTER TABLE "invitation"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;
