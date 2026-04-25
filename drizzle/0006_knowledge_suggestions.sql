CREATE TABLE "knowledge_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"source_conversation_id" text,
	"approved_source_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"content" text NOT NULL,
	"reason" text,
	"review_note" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ADD CONSTRAINT "knowledge_suggestion_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ADD CONSTRAINT "knowledge_suggestion_source_conversation_id_conversation_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ADD CONSTRAINT "knowledge_suggestion_approved_source_id_knowledge_source_id_fk" FOREIGN KEY ("approved_source_id") REFERENCES "public"."knowledge_source"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ADD CONSTRAINT "knowledge_suggestion_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "knowledge_suggestion_product_status_idx" ON "knowledge_suggestion" USING btree ("product_id","status");
