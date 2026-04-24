CREATE TABLE "widget_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"bot_name" text DEFAULT 'Support' NOT NULL,
	"greeting" text DEFAULT 'Hi there! How can I help you today?' NOT NULL,
	"position" text DEFAULT 'bottom-right' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"accent_color" text DEFAULT '#18181b' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "widget_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "widget_config" ADD CONSTRAINT "widget_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;