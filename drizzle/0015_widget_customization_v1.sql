ALTER TABLE "widget_config"
  ADD COLUMN IF NOT EXISTS "launcher_label" text NOT NULL DEFAULT 'Support',
  ADD COLUMN IF NOT EXISTS "launcher_style" text NOT NULL DEFAULT 'icon',
  ADD COLUMN IF NOT EXISTS "panel_size" text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "border_radius" text NOT NULL DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS "intro_title" text NOT NULL DEFAULT 'Start a conversation',
  ADD COLUMN IF NOT EXISTS "intro_description" text NOT NULL DEFAULT 'Enter your details so we can help you.',
  ADD COLUMN IF NOT EXISTS "input_placeholder" text NOT NULL DEFAULT 'Ask a question...',
  ADD COLUMN IF NOT EXISTS "agent_handoff_label" text NOT NULL DEFAULT 'Speak to an Agent',
  ADD COLUMN IF NOT EXISTS "show_powered_by" boolean NOT NULL DEFAULT true;
