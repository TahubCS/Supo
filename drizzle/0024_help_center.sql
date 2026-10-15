-- Public help center: settings, categories, articles and their history.
CREATE TABLE IF NOT EXISTS "help_center" (
  "product_id" text PRIMARY KEY NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "enabled" boolean DEFAULT false NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "help_center_slug_idx" ON "help_center" ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_category" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "article_category_product_slug_idx" ON "article_category" ("product_id", "slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "category_id" text REFERENCES "article_category"("id") ON DELETE set null,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "summary" text,
  "body_md" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "author_id" text REFERENCES "user"("id") ON DELETE set null,
  "knowledge_source_id" text REFERENCES "knowledge_source"("id") ON DELETE set null,
  "published_at" timestamp,
  "view_count" integer DEFAULT 0 NOT NULL,
  "helpful_count" integer DEFAULT 0 NOT NULL,
  "not_helpful_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "search_tsv" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("summary", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("body_md", '')), 'C')
  ) STORED
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "article_product_slug_idx" ON "article" ("product_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_product_status_idx" ON "article" ("product_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_search_idx" ON "article" USING gin ("search_tsv");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_version" (
  "id" text PRIMARY KEY NOT NULL,
  "article_id" text NOT NULL REFERENCES "article"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "summary" text,
  "body_md" text NOT NULL,
  "author_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_version_article_idx" ON "article_version" ("article_id", "created_at");
