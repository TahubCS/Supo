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

## Knowledge Automation

Supo's knowledge system is designed around a review queue instead of silently changing production knowledge.

- Conversations can produce pending FAQ suggestions.
- Widget and admin test queries can create missing-knowledge gap suggestions.
- Gap suggestions store the real question without fake placeholder answers.
- Reviewers can edit gap answers, approve useful suggestions into `knowledge_source`, or reject them.
- Approved sources are ingested and indexed through the existing background ingestion pipeline.
- Re-indexing prepares replacement chunks before swapping, so previously indexed knowledge remains usable if a later sync fails.

## Security Posture

Supo currently includes early-stage SaaS hardening:

- Email/password verification is enforced.
- Google and GitHub OAuth are supported.
- Better Auth trusted origins are configured by environment.
- Super-admin access requires both verified email and exact env-configured Better Auth user id.
- Admin impersonation is intentionally disabled.
- Super-admin actions are audited.
- Admin can view/revoke sessions and ban/unban users.
- Public auth and chat endpoints are rate limited through Upstash Redis.
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

The latest migration at this release is `0012_conversation_public_access_token`, which adds the widget bearer token used for public conversation access.

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
