CREATE TABLE "security_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"organization_id" text,
	"product_id" text,
	"event_type" text NOT NULL,
	"severity" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"path" text,
	"method" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "security_event_created_idx" ON "security_event" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "security_event_user_created_idx" ON "security_event" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "security_event_product_created_idx" ON "security_event" USING btree ("product_id","created_at");
--> statement-breakpoint
CREATE INDEX "security_event_severity_created_idx" ON "security_event" USING btree ("severity","created_at");
