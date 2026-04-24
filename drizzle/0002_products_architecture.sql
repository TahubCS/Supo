CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
TRUNCATE "widget_config";
--> statement-breakpoint
ALTER TABLE "widget_config" DROP CONSTRAINT "widget_config_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "widget_config" DROP CONSTRAINT "widget_config_organization_id_unique";
--> statement-breakpoint
ALTER TABLE "widget_config" DROP COLUMN "organization_id";
--> statement-breakpoint
ALTER TABLE "widget_config" ADD COLUMN "product_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "widget_config" ADD CONSTRAINT "widget_config_product_id_unique" UNIQUE("product_id");
--> statement-breakpoint
ALTER TABLE "widget_config" ADD CONSTRAINT "widget_config_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
