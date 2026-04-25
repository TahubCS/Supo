ALTER TABLE "knowledge_suggestion" ADD COLUMN "kind" text DEFAULT 'faq' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ALTER COLUMN "answer" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_suggestion" ALTER COLUMN "content" DROP NOT NULL;
