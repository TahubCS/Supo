# Supo

Supo is a multi-tenant AI support platform for businesses. It helps teams automate customer support with AI, escalate complex cases to human agents, and manage conversations, knowledge, widget configuration, admin controls, and analytics from one product.

> Status: alpha. Supo is actively being built and should be treated as an early product, not a stable public API.

## What Supo Does

- Embeddable customer support widget with streaming AI replies.
- Product-scoped inbox for customer conversations.
- Knowledge base ingestion from articles, URLs, GitHub repositories, and product sitemaps.
- Retrieval-augmented AI answers with source-aware context.
- Automated knowledge suggestions from resolved conversations.
- Missing-knowledge detection that creates reviewable KB gaps.
- Review queue for approving or rejecting generated knowledge updates.
- Super-admin visibility across users, workspaces, products, conversations, and knowledge activity.
- Auth hardening, rate limits, audit logs, and security activity tracking.

## Product Areas

Supo is organized around five product areas:

1. **Customer Widget** - embedded chat, AI responses, conversation persistence, and escalation entry points.
2. **AI Orchestration Layer** - prompt orchestration, retrieval, model fallback, confidence signals, and guardrails.
3. **Support Core** - workspaces, products, customers, conversations, messages, tickets, and events.
4. **Agent Workspace** - shared inbox, conversation timeline, human replies, and learning from support cases.
5. **Admin, Knowledge, and Analytics** - knowledge management, team controls, admin oversight, and reporting.

## Tech Stack

- **Framework:** Next.js 16 App Router
- **Runtime:** React 19, TypeScript
- **Styling:** Tailwind CSS 4, shadcn-style primitives, shared theme tokens
- **Auth:** Better Auth with organization and admin plugins
- **Database:** Neon Postgres with Drizzle ORM
- **Vector Search:** pgvector with Gemini embeddings
- **AI:** Vercel AI SDK v6 with Google Gemini/Gemma model fallback
- **Realtime:** Ably with widget polling fallback
- **Rate Limiting:** Upstash Redis
- **Email:** Resend
- **Deployment:** Vercel

## Current Architecture

```txt
src/app/
  (auth)/                         Auth pages
  (app)/
    (workspace)/dashboard          Workspace/product dashboard
    (workspace)/settings           Workspace settings
    admin/                         Super-admin overview and controls
    products/[id]/
      inbox/                       Agent inbox
      knowledge/                   KB sources, suggestions, and test panel
      widget/                      Widget configuration
      analytics/                   Analytics surface
  api/
    auth/[...all]/                 Better Auth route
    ably/token                     Short-lived Ably token requests
    chat/                          Public widget chat API
    chat/escalate                  Widget-to-agent escalation
    knowledge/ingest               Background KB ingestion
    knowledge/query                RAG query endpoint
    messages/poll                  Widget polling fallback
    cron/sync-knowledge            Daily knowledge sync

src/components/                    Shared app and marketing components
src/db/                            Drizzle schema and database entrypoint
src/lib/                           Auth, env, admin, security, and knowledge utilities
drizzle/                           SQL migrations
```

## Knowledge Base

**Sources:** articles (markdown), single pages, whole websites (crawled via `robots.txt` / `sitemap.xml`, sitemap indexes, or by following links under the start URL; up to 200 pages), GitHub repositories (README and `docs/`), and approved answers learned from conversations. URL, website and GitHub sources re-sync daily and are only re-embedded when their content changes.

**Pipeline** (`src/lib/knowledge/*`):

1. `safe-fetch` downloads pages with SSRF protection (private/internal addresses blocked, redirects re-validated), timeouts and size limits.
2. `extract` turns HTML into structured text (headings, paragraphs, lists), dropping navigation, headers, footers and scripts.
3. `chunk` splits by heading, then paragraph, then sentence, into passages of at most 1,200 characters with sentence overlap. The page title and heading path are embedded with each passage.
4. Gemini embeddings (768 dimensions) are stored in pgvector; Postgres maintains a full-text `tsvector` for each passage.
5. `retrieve` runs vector and keyword search in parallel, merges them with Reciprocal Rank Fusion and keeps only relevant passages. Retrieval is scoped to the product (pgvector ≥ 0.8 uses HNSW iterative scans; older versions use an exact per-product scan).
6. `prompt` builds one grounded system prompt, shared by the widget and the admin test panel. AI answers carry citations that the widget shows as source links.

**Background jobs:** indexing runs on a Postgres job queue (`background_job`, `src/lib/jobs`). Jobs start right after the request through Next.js `after()`, retry with backoff, and are recovered by cron if a function dies. `/api/cron/sync-knowledge` (daily) re-queues stuck sources, syncs stale ones and drains the queue; `/api/cron/jobs` drains the queue. On Vercel Pro you can schedule `/api/cron/jobs` every few minutes.

**Review queue:**

- Resolved conversations can produce pending FAQ suggestions.
- Unanswered customer questions become missing-knowledge gaps. Small talk is ignored and similar questions are merged with an "asked N×" counter.
- Reviewers can write answers to gaps and approve them into the knowledge base, or reject them.
- Re-indexing swaps chunks atomically, so the previous index keeps serving if a refresh fails.

## Security Posture

Supo currently includes early-stage SaaS hardening:

- Email/password verification is enforced.
- Google and GitHub OAuth are supported.
- Better Auth trusted origins are configured by environment.
- Super-admin access requires both verified email and exact env-configured Better Auth user id.
- Admin impersonation is intentionally disabled.
- Super-admin actions are audited.
- Admin can view/revoke sessions and ban/unban users.
- Public auth and all widget endpoints (including `/api/widget/*` aliases) are rate limited through Upstash Redis.
- Products can restrict the widget to an allow-list of website origins (Widget → Allowed websites).
- Realtime tokens are scoped to a single product; agents cannot subscribe to other products' conversations or publish inbox events.
- Internal and cron routes use a dedicated `CRON_SECRET` with constant-time comparison.
- Public widget conversation reads/subscriptions require `conversationId + conversationToken`.
- Widget polling is rate limited and rejects invalid `since` timestamps.
- Proxy-level checks reject oversized chat requests and invalid auth POST requests.
- Route-level quotas limit expensive AI and knowledge operations.
- Ably powers realtime inbox/widget updates and gracefully falls back to polling when unavailable.
- Suspicious new IP/user-agent fingerprints are logged after app auth.
- Owner alerts are sent for new super-admin fingerprints.

Paid WAF, CAPTCHA, bot-management products, and domain-based email hardening are intentionally deferred.

## Prerequisites

- Bun
- Node.js compatible with Next.js 16
- Neon Postgres database
- Upstash Redis database
- Google OAuth app
- GitHub OAuth app
- Google Gemini API key
- Resend API key
- Ably API key for realtime features

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values for your environment.

Notes:

- `DATABASE_URL` should use `sslmode=verify-full` for production Neon connections.
- `BETTER_AUTH_URL` must match the deployed app URL in production.
- `BETTER_AUTH_ADMIN_USER_IDS` should contain only the trusted owner/admin Better Auth user id.
- Upstash Redis is required in production. Local development fails open when Redis env vars are absent.
- `ABLY_API_KEY` enables realtime inbox/widget updates. The widget keeps polling as a fallback if Ably is absent.
- `CRON_SECRET` authorizes Vercel Cron and internal job routes. Vercel sends it as `Authorization: Bearer $CRON_SECRET` automatically when the variable is set on the project.
- `DATABASE_SSL=disable` (or `sslmode=disable` in the URL) turns off TLS for a local Postgres.
- Resend's `onboarding@resend.dev` sender is only reliable for the Resend account owner's inbox until a verified domain is configured.

## Local Development

Install dependencies:

```bash
bun install
```

Run database migrations:

```bash
bun run db:migrate
```

Start the development server:

```bash
bun run dev
```

Open:

```txt
http://localhost:3000
```

## Useful Commands

```bash
bun run dev          # Start local dev server
bun run lint         # Run ESLint
bun run typecheck    # Type-check the app
bun run test         # Run unit tests (Vitest)
bun run build        # Production build and TypeScript check
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Apply Drizzle migrations
```

## Database

The Drizzle schema lives in:

```txt
src/db/schema.ts
```

Current core tables include:

- Better Auth: `user`, `session`, `account`, `verification`
- Organization plugin: `organization`, `member`, `invitation`
- Supo app data: `product`, `widget_config`, `customer`, `conversation`, `message`
- Knowledge: `knowledge_source`, `knowledge_suggestion`, `knowledge_chunk`
- Admin/security: `admin_audit_log`, `security_event`

Migrations from `0017` onward are hand-written, idempotent SQL registered in `drizzle/meta/_journal.json` (the Drizzle snapshots for 0012–0016 are missing, so do not rely on `db:generate` until a fresh baseline snapshot is created).

`0018_repair_knowledge_schema` repairs databases that skipped the knowledge-base migrations: journal entries 0002–0005 carry older timestamps than 0001, and Drizzle only applies migrations newer than the last applied one. To check a database, run:

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;
```

Migrations live in:

```txt
drizzle/
```

## Deployment

Supo is designed for Vercel deployment.

Before deploying:

1. Set all required environment variables in Vercel.
2. Set `BETTER_AUTH_URL` to the production URL.
3. Ensure `DATABASE_URL` uses secure SSL settings.
4. Set Upstash Redis env vars so production rate limiting does not fail closed.
5. Run migrations against the production database.
6. Run `bun run lint` and `bun run build`.

## Release Guidance

Recommended first public tag:

```txt
v0.1.0-alpha.1
```

Use an alpha tag until the product has:

- Stable onboarding.
- A verified production email domain.
- A clearer billing/usage story.
- More mature analytics and abuse monitoring.
- A mature support process for production users.

See `CHANGELOG.md` for release notes and `SECURITY.md` for the current alpha security policy.

## Repository Notes

- `AGENTS.md` is the living architecture and implementation guide for AI coding agents.
- The app name is `Supo`.
- Do not introduce AWS services.
- Prefer Neon, Drizzle, Better Auth, Vercel, Upstash, Resend, and Cloudflare R2 where needed.
- Keep product-scoped data under `product`.
- Keep workspace tenancy anchored to Better Auth `organization`.

## License

No license has been selected yet. Until a license is added, this repository is not open source by default.
