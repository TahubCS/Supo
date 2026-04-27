# Changelog

All notable changes to Supo will be documented in this file.

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
