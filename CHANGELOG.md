# Changelog

All notable changes to Supo will be documented in this file.

## Unreleased

### Help center

- **Public help center** at `/help/{slug}` with categories, search, article pages, helpful/not-helpful voting, related articles, SEO metadata, JSON-LD, `sitemap.xml` and `robots.txt`.
- **Article editor:** Markdown with preview, categories, custom URLs, draft/publish, version history with restore, Cmd/Ctrl+S, and import from PDF/DOCX/Markdown/text/CSV/HTML.
- **AI integration:** publishing mirrors the article into the knowledge base (re-indexed on every edit, removed on unpublish). AI citations link to the public article, and change if the help center address changes.
- **Widget:** popular articles are suggested in the empty chat (SDK `0.1.0-alpha.9`).
- **Knowledge base uploads:** a new File source type (PDF via `unpdf`, Word via `mammoth`, up to 4 MB).
- Migration `0024_help_center` adds `help_center`, `article_category`, `article` (with a weighted FTS column and GIN index) and `article_version`.

### SLAs, business hours and CSAT

- **Business hours:** per-product timezone, weekly schedule and holidays (Inbox settings). Handoff availability treats agents as offline outside business hours, so customers get the email follow-up path.
- **SLA policies:** first-response and resolution targets per priority, counted in business minutes (DST-aware). Due dates are set on handoff and recomputed on priority changes.
- **Inbox:** live SLA badges ("Reply in 12m", "Reply overdue", "Resolution overdue"), a "Due soon" sort, SLA details in the conversation header, and the customer's rating and feedback.
- **Breach warnings:** a job-runner sweeper emails inbox members once per conversation 10 minutes before a first-response breach.
- **CSAT:** the widget asks for a 1–5 rating plus an optional comment after an agent resolves a conversation (`POST /api/widget/ratings`). Can be turned off per product. Widget SDK `0.1.0-alpha.8` adds `submitRating()` and the `rating` event.
- **Analytics rewrite:** 7/30/90-day windows with previous-period deltas: AI deflection, first-response and resolution p50/p90, SLA attainment, CSAT, knowledge-base answer rate, per-agent table, top unanswered questions, and a CSV export of conversations (formula-injection safe).
- Migration `0023_sla_business_hours_csat` adds `business_hours`, `sla_policy` and `conversation_rating`, SLA columns on `conversation` and `widget_config.csat_enabled`.

### Review follow-ups

- **Migrations:** `0017` no longer fails on databases that are missing the knowledge tables; their indexes are created by `0018` instead.
- **Knowledge jobs:**
  - Failed indexing attempts retry within the same invocation (30 s backoff), and dashboard traffic drains due jobs, so a transient error no longer waits for the daily cron.
  - Editing a source while it is being indexed can no longer be overwritten by the older run: sources have a `revision`, and job de-duplication applies only to queued jobs (migration `0022`).
- **SSRF:** outbound fetches validate DNS at connection time (undici `connect.lookup`), closing the DNS-rebinding gap.
- **Widget origins:** default ports (`:443`, `:80`) are normalized, so `https://app.example.com:443` matches the browser's origin.
- **Round robin:** assignment is serialized per product, so bursts of escalations can't exceed an agent's cap.
- **Inbox:**
  - Snoozed conversations wake on time without a reload.
  - Server search matches tags.
  - Bulk resolve no longer hides conversations that failed to resolve.
- **Widget SDK:** `runtime.on("message")` fires for server messages (`0.1.0-alpha.7`).

### Agent workspace

- **Internal notes:** an amber "Internal note" composer mode. Notes travel on the agents-only inbox channel and are never sent to the widget, returned by polling or shown to the AI.
- **Macros (canned responses):** type `/` in the reply box. Supports variables (`{{customer.first_name}}`, `{{agent.name}}`, …) and actions (set priority, add tags, resolve after sending). They are managed under the new **Inbox settings** page, with usage counts.
- **Draft with AI:** drafts the next reply from the knowledge base and the conversation, in the agent's voice. The handoff summary can be regenerated.
- **Priority and tags** per conversation, shown in the list. A customer sidebar shows the profile, identity verification status and previous conversations.
- **Search:** full-text search over message bodies (GIN index), plus customers, subjects and tags. Bulk resolve, and `j`/`k` keyboard navigation.
- **Round-robin routing** (Inbox settings): escalations are assigned automatically to the least-busy online agent, under a per-agent active-chat cap. The assignee gets a browser notification.
- **First response time** is recorded on the first human reply (used for SLAs).
- **Product audit log:** conversation assignment, transfer, resolve and priority changes; knowledge source changes; widget, origin, handoff and identity-secret changes; team role changes; macros; routing. Admins and developers can view it on the Activity page.
- Migration `0021_agent_workspace`.

### Human handoff (fixed and rebuilt)

- **No more accidental lock-outs:** the AI used to escalate whenever the knowledge base had no match (even for "hi"). It then stopped answering for good, and the widget disabled the input until an agent joined, which might be never.
- **Smart triggers** (`src/lib/handoff/policy.ts`): escalate when the customer asks for a person (multilingual), shows frustration, or two substantive questions in a row go unanswered. Greetings and single misses never escalate.
- The decision is made before streaming, so the widget learns about it immediately. While waiting, the AI keeps helping and the customer can keep typing. The AI only stops once an agent is active.
- **Availability-aware:** with no agent online, the customer is told the team will follow up by email (and asked for an address if unknown), and the team is emailed. After a configurable wait (default 5 minutes) without a claim, the customer gets the same notice and the team gets a reminder.
- **Agent workflow:** atomic claim (two agents can no longer both "win"), claim for every inbox role, take over, transfer to a teammate, return to queue, hand back to AI, and snooze with a wake time.
  - Replies no longer steal assignment.
  - System messages ("Alex joined the conversation") appear on both sides.
- **AI handoff summary** for the agent, the handoff reason in the thread, an email to the customer when an agent replies after they left, and a typing indicator.
- **Inbox:**
  - New conversations and escalations appear live (agents used to see nothing until a reload).
  - One shared realtime connection; the old one closed itself under React StrictMode.
  - Polling fallback without Ably.
  - Waiting / Mine / Open / Resolved views, deep links from emails, and the N+1 query is gone.
  - Errors show a toast and replies keep their draft on failure.
- **Lossless message cursor** (`message.seq`) for polling; the AI's stream-finish handler can no longer overwrite a handoff that happened mid-stream.
- **Security:** a conversation is no longer resumed from an email address alone (anyone could read another customer's chat). Optional HMAC identity verification (`customer.userHash`) is configurable per product; unverified sessions can no longer overwrite a customer's profile.
- Widget SDK `0.1.0-alpha.6` (see `packages/widget/CHANGELOG.md`).
- Migration `0020_human_handoff`. It also releases stale "waiting" conversations created by the old rule.

### Knowledge base (fixed and rebuilt)

- **Indexing actually runs:** sources were indexed by an un-awaited `fetch` from server actions, which Vercel often froze, leaving sources stuck in "Indexing…" forever. Indexing now runs on a Postgres job queue with `after()`, retries and cron recovery. Stuck sources are re-queued.
- **Web pages are chunked properly:** HTML used to be flattened into one line, so every page became a single chunk of up to 100k characters that could not be embedded or retrieved. Pages are now converted to structured text and split into passages of at most 1,200 characters by heading, paragraph and sentence.
- **Retrieval works for every tenant:** the global HNSW index filtered by product after the scan, so smaller products got no results. Retrieval is now scoped per product, hybrid (vector + full-text with Reciprocal Rank Fusion) and shared by the widget, the test panel and the API.
- Website crawling: `robots.txt` and sitemap index support, relative link crawling, www/apex handling, path scoping and a configurable page budget (up to 200 pages).
- SSRF protection, timeouts and size limits for all fetched URLs.
- Citations: AI answers are stored with their sources and shown in the widget as source links.
- The knowledge UI shows live indexing status, visible errors and partial crawl failures. It adds per-source enable/disable, editing, a "view content" passage viewer and a Website source type.
- The test panel uses the production prompt and shows the retrieved passages with their scores; it no longer creates gap suggestions.
- Gap suggestions ignore greetings and small talk and merge similar questions with an "asked N×" counter.
- Small talk and retrieval outages no longer escalate the conversation to a human.
- The embedding-model lock re-reads the database after the race, and a single transient error no longer pins a product to the fallback model.
- Migration `0019_knowledge_pipeline`.

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
