-- Ensure allowed_origins exists on widget_config
ALTER TABLE "widget_config"
  ADD COLUMN IF NOT EXISTS "allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL;

