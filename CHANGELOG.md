# Changelog

All notable changes to Supo will be documented in this file.

## Unreleased

### Security

- Realtime (Ably) agent tokens are scoped to a single product: conversation channels are now `org:{org}:product:{product}:conversation:{id}` and agents get subscribe-only inbox access.
- Optional per-product widget origin allow-list (`widget_config.allowed_origins`), enforced on chat, poll, escalation, realtime token and config endpoints.
- Proxy rate limits and body-size caps now cover the `/api/widget/*` aliases, polling and realtime token routes.
- Internal/cron routes use a dedicated `CRON_SECRET` (constant-time compare, Vercel Cron bearer header) instead of the Better Auth infra key. This fixes the nightly knowledge sync, which always returned 401.
- User-controlled values are HTML-escaped in invite, verification and password-reset emails.
- The super-admin console no longer sends raw session tokens to the browser.

### Fixed

- Workspace owners can no longer be downgraded by an explicit product role; workspace admins get product admin access by default, matching the dashboard.
- Agent reply quota raised from 120 to 1200 messages per hour.
- Local Postgres works without TLS (`DATABASE_SSL=disable` or `sslmode=disable`).

### Added

- Vitest unit tests, `typecheck`/`test` scripts and a GitHub Actions CI workflow (lint, typecheck, tests, build, migrations against pgvector Postgres).
- Migration `0017` (hot-path indexes, widget allowed origins) and `0018` (idempotent knowledge-base schema repair).

### Removed

- Unused mock components and unused dependencies (MUI, Emotion, react-dnd, react-slick, masonry, confetti, popper).

## v0.1.0-alpha.1

Initial alpha release candidate.

### Added

- Multi-tenant workspace/product architecture with Better Auth organizations.
- Embeddable customer support widget with streaming AI responses.
- Product inbox with live conversation updates, human replies, resolve/snooze/reopen flows, and agent handoff state.
- Ably realtime for inbox, widget conversation updates, escalation status, and agent presence, with polling fallback.
- Knowledge base sources for articles, URLs, GitHub repositories, and sitemap bootstrap.
- RAG test panel and widget knowledge retrieval using pgvector-backed chunks.
- Knowledge suggestion review queue for resolved-conversation FAQs and missing-knowledge gaps.
- Approval/rejection workflow that turns reviewed suggestions into indexed knowledge sources.
- Super-admin overview with guarded session controls, ban/unban, audit logging, and security activity.
- Abuse controls using Upstash Redis quotas, proxy checks, widget input limits, and suspicious-session logging.

### Security

- Email/password verification is enforced for app routes.
- Super-admin access requires verified email and env-configured Better Auth user id.
- Admin impersonation is disabled.
- Public widget conversation reads/subscriptions require `conversationId + conversationToken`.
- Widget polling is rate-limited and rejects invalid `since` timestamps.
- Production rate limiting fails closed when Upstash Redis env vars are missing.

### Known Limitations

- Alpha release: APIs and data model may still change.
- Production email deliverability needs a verified Resend sending domain.
- Billing, usage metering, and mature analytics are not complete.
- Paid WAF, CAPTCHA, bot-management rules, and domain-based protections are deferred.
- Public signup remains enabled; rely on admin controls and monitoring until invite-only onboarding is added.

### Required Before Deployment

- Apply all Drizzle migrations through `0012_conversation_public_access_token`.
- Set production `DATABASE_URL` with `sslmode=verify-full`.
- Set all required Vercel environment variables from `.env.example`.
- Run `bun run lint` and `bun run build`.
