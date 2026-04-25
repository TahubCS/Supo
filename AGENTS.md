# Supo Project Architecture

## Product Name

- The app name is `Supo`.
- Use `Supo` as the primary product name unless the user explicitly decides to rebrand.
- When supporting marketing copy, prefer `Supo` over placeholder names such as `SupportAI`.
- If a descriptor is needed, use `Supo - AI Support Platform`.

## Product Goal

Supo is a multi-tenant AI support platform for businesses. It helps teams automate customer support with AI, escalate complex cases to humans, and manage conversations, tickets, knowledge, and analytics from one product.

## Core Constraints

- Do not use AWS in any form for this project.
- Prefer managed platforms with predictable pricing and simple operations.
- Optimize for low redundancy, high reuse, and minimal code.
- Build on top of the existing design system and prebuilt components before creating anything new.
- Avoid writing custom code when an existing component, utility, pattern, or abstraction already solves the problem well.
- Treat `AGENTS.md` as a living source of project context and keep it updated whenever architecture or workflow decisions change.

## Five Product Areas

These are the five products that make up the Supo platform. Agents should build with these as the top-level product architecture.

### 1. Customer Widget

This is the embedded support experience used by end users.

- Chat widget
- Quick replies
- File attachments
- AI responses
- Escalation entry points
- Conversation persistence

### 2. AI Orchestration Layer

This is the intelligence layer that decides how Supo responds.

- Prompt orchestration
- Knowledge retrieval
- Action routing
- Confidence scoring
- Escalation decisions
- Guardrails and auditability

### 3. Support Core

This is the operational data model and backend domain.

- Workspaces
- Customers
- Conversations
- Messages
- Tickets
- Assignments
- Tags
- SLAs
- Events

### 4. Agent Workspace

This is the internal app used by human support teams.

- Shared inbox
- Conversation timeline
- Handoff from AI to human
- Customer profile view
- Notes and internal context
- Macros and response suggestions

### 5. Admin, Knowledge, and Analytics

This is the workspace management surface.

- Knowledge base management
- Channel configuration
- Team and permissions
- Usage and billing visibility
- Resolution analytics
- Automation settings

## Recommended Technical Architecture

### Frontend

- `Next.js 16` App Router
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- Existing UI kit in `src/components/ui`
- Global theming is required from the start for both marketing and future dashboard surfaces
- Current root theme provider lives in `src/components/theme-provider.tsx`
- Current manual theme toggle lives in `src/components/ThemeToggle.tsx`
- Theme state should be shared globally through the root layout, not page-local implementations
- The current marketing landing page source of truth is:
  - `src/components/LandingPage.tsx`
  - `src/components/Navbar.tsx`
  - `src/components/HeroSection.tsx`
  - `src/components/FeaturesSection.tsx`
  - `src/components/APIPlayground.tsx`
  - `src/components/PricingSection.tsx`
  - `src/components/TestimonialsSection.tsx`
  - `src/components/CTABanner.tsx`
  - `src/components/Footer.tsx`
- The current marketing page follows the Figma-generated SaaS landing flow integrated into the Next.js app, not the raw Vite export structure
- Marketing redesign work should be done section-by-section against the latest Figma export/screenshots, not by broad reinterpretation
- The current navbar and hero are aligned to the newer enterprise-style Figma export and include the shared theme toggle even when the export omits it

### Backend

- Next.js server components, server functions, and route handlers for the app backend
- Background jobs only when the feature actually needs async processing
- Keep the backend modular by feature, not by technical layer alone
- Current minimum backend auth route is mounted at `src/app/api/auth/[...all]/route.ts`

### Database

- Use `Neon` as the primary Postgres provider
- Use `PostgreSQL 18` for new environments
- Design every core app table as multi-tenant with `organization_id`, referencing `organization.id` from the Better Auth organization plugin.
- Current DB connectivity uses `pg` + `drizzle-orm/node-postgres`
- Current shared DB entrypoint is `src/db/index.ts`
- Current Drizzle schema entrypoint is `src/db/schema.ts`
- Current Drizzle config file is `drizzle.config.ts`
- Current tables in `src/db/schema.ts`:
  - Better Auth core: `user`, `session`, `account`, `verification`
  - Organization plugin: `organization`, `member`, `invitation`
  - App-owned: `product`, `widget_config`, `customer`, `conversation`, `message`, `knowledge_source`, `knowledge_suggestion`, `knowledge_chunk`, `admin_audit_log`
- `product` is the first app-owned table. It belongs to an `organization` and is the unit around which knowledge, conversations, widget config, and analytics are scoped.
- `widget_config` is scoped to `product_id` (one-to-one), not `organization_id`. Do not revert this — widget config is per-product, not per-workspace.
- The `organization` table is the tenant anchor. Do not reintroduce a separate `workspaces` table — the earlier placeholder was dropped on purpose.
- Drizzle `experimental.joins: true` is enabled in `src/db/index.ts` for relational query performance.

### ORM

- Use `Drizzle ORM`
- Do not default to Prisma for this project
- Favor Drizzle for simpler SQL-first control, fewer moving parts, and better fit with Neon
- Use Drizzle schema files and generated SQL migrations as the readable source of truth for agents
- Current migration commands are `bun run db:generate` and `bun run db:migrate`

### Auth

- Prefer `Better Auth` as the default authentication solution
- Do not default to `Clerk` for this project unless the user explicitly chooses it
- Keep auth decoupled from the database provider
- Current auth server entrypoint is `src/lib/auth.ts`
- Current auth client entrypoint is `src/lib/auth-client.ts`
- Current Better Auth setup uses the Drizzle adapter with `emailAndPassword` enabled, Better Auth Admin plugin, and social providers for Google and GitHub. Microsoft (Entra ID) is deferred until the user decides to configure the Azure app — the plumbing is structured so adding it is a two-field change in `auth.ts` + two env vars.
- The `organization` plugin is enabled on both server (`organization()`) and client (`organizationClient()`) — this is how Supo represents tenants, teams, roles, and invitations. Do not rebuild membership/invitation tables by hand.
- `trustedOrigins` is `[BETTER_AUTH_URL]` in production and `[BETTER_AUTH_URL, "http://localhost:3000"]` outside production. Any new deployed host must be added intentionally.
- Current Better Auth Infrastructure integration uses the `dash()` plugin.
- `appName: "Supo"` is set in the auth config.
- `advanced.ipAddress.ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"]` is set for correct IP detection on Vercel.
- `experimental.joins: true` is enabled for relational query performance.
- `requireEmailVerification: true` is set for email/password auth. Email/password sign-ups are sent to `/verify-email` and cannot sign in until verified. `(app)/layout.tsx` also redirects any existing unverified session back to `/verify-email`, so older unverified sessions cannot enter dashboard/product/admin routes.
- Transactional email (verification, password reset) uses `Resend` via `onboarding@resend.dev`. This sender only delivers to the Resend account owner's email without a verified domain; use Google/GitHub auth for external testers until a verified sending domain is configured. The `RESEND_API_KEY` env var is required.
- Super-admin access is separate from workspace membership. `/admin` requires a signed-in user whose email is in `SUPO_SUPER_ADMIN_EMAILS`, whose id is in `BETTER_AUTH_ADMIN_USER_IDS`, and whose `emailVerified` flag is true. Do not grant admin privileges from unverified email alone while public signup is enabled.
- `/admin` provides read-first global visibility plus guarded non-destructive controls: view sessions, revoke sessions, and ban/unban users. Do not add delete-user or impersonation controls unless explicitly requested.
- Admin impersonation is intentionally disabled for security. Better Auth Admin is configured with a custom access-control role that omits `user.impersonate`, and Supo admin server actions do not expose impersonation.
- Admin actions in `src/app/(app)/admin/actions.ts` must use the server-side `requireSuperAdmin()` guard, must never target the configured super-admin account, and must write `admin_audit_log` rows for high-risk actions.
- Public auth/chat rate limiting lives in `src/proxy.ts`. It covers chat, sign-in, sign-up, password reset, and verification-email sends. It prefers `x-vercel-forwarded-for` before `x-forwarded-for`; production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` or requests fail closed with a clear 503. Local development fails open.
- Required env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `SUPO_SUPER_ADMIN_EMAILS`, `BETTER_AUTH_ADMIN_USER_IDS`. `src/lib/env.ts` validates at import time — do not add optional unvalidated env access elsewhere.

### Storage

- Prefer `Cloudflare R2` for attachments and uploaded assets

### Cache / Queue

- `Upstash Redis` is used by `src/proxy.ts` for public `/api/chat` and auth endpoint rate limiting.
- Production must set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; local development fails open when they are absent.
- Add more Redis usage only if needed for caching, jobs, or event buffering.

## App Structure

### Current live structure

```
src/app/
  layout.tsx                            ← root layout: ThemeProvider, metadata
  page.tsx                              ← marketing landing page
  (app)/
    layout.tsx                          ← auth check only — redirects to /sign-in if no session
    (workspace)/
      layout.tsx                        ← org check + WorkspaceSidebar; shows CreateWorkspaceForm if no org
      dashboard/
        page.tsx                        ← products list + "Add product" dialog
        actions.ts                      ← createProduct server action
        NewProductDialog.tsx            ← client dialog for creating a product
      settings/
        page.tsx                        ← workspace settings (account, team, billing)
    admin/
      page.tsx                          ← verified super-admin DB overview for all workspaces/users with guarded session/ban controls
      actions.ts                        ← env-gated Supo admin actions + audit logging
      AdminUserActions.tsx              ← client controls for sessions and ban/unban
    products/
      [id]/
        layout.tsx                      ← verifies product ownership + ProductSidebar
        widget/
          page.tsx                      ← widget configurator server shell
          WidgetConfigurator.tsx        ← full client configurator (live preview + embed code)
          actions.ts                    ← saveWidgetConfig server action (scoped to productId)
        inbox/
          page.tsx                        ← server component: fetches conversations + latest messages, renders InboxView
          InboxView.tsx                   ← client orchestrator: selectedId state, two-panel flex layout
          ConversationList.tsx            ← left panel (w-80): search, All/Open/Resolved tabs, conversation items
          ConversationThread.tsx          ← right panel: sticky header, message bubbles, reply composer
          actions.ts                      ← getMessages, resolveConversation, snoozeConversation, reopenConversation, sendMessage
          types.ts                        ← ConversationWithDetails type shared across inbox components
        knowledge/
          page.tsx                        ← server component: fetches knowledge sources + pending suggestions, renders KnowledgeBase
          KnowledgeBase.tsx               ← client orchestrator: SuggestionList + SourceList + AddSourceDialog + TestQueryPanel
          SourceList.tsx                  ← grid of source cards with status badges, re-index, delete
          SuggestionList.tsx              ← pending FAQ/gap review cards with answer editor and approve/reject controls
          AddSourceDialog.tsx             ← dialog: Article / URL / GitHub segmented type selector
          TestQueryPanel.tsx              ← test Q&A: question input → RAG answer + source citations
          actions.ts                      ← addSource, deleteSource, reindexSource, approveSuggestion, rejectSuggestion, updateSuggestionAnswer, testQuery
        analytics/page.tsx
  (auth)/
    layout.tsx
    sign-in/page.tsx
    sign-up/page.tsx
    sign-up/team/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
    verify-email/page.tsx
  api/
    auth/[...all]/route.ts
    chat/route.ts                         ← POST: public widget chat (streaming); CORS open; no auth — productId only
    knowledge/
      ingest/route.ts                     ← POST: background ingestion (maxDuration=300); auth via x-api-key
      query/route.ts                      ← POST: RAG query (embed → pgvector search → generate)
    cron/
      sync-knowledge/route.ts             ← GET: daily cron (02:00 UTC); re-indexes stale sources with change detection

src/components/
  WorkspaceSidebar.tsx                  ← workspace-level nav (Products, Settings, user/sign-out)
  ProductSidebar.tsx                    ← product-level nav (← All products, Inbox, Knowledge, Widget, Analytics)
  CreateWorkspaceForm.tsx               ← client form for creating the first org
  theme-provider.tsx
  ThemeToggle.tsx
  ui/                                   ← shadcn primitives

src/db/
  index.ts                              ← drizzle instance with schema
  schema.ts                             ← all table definitions and relations

src/lib/
  admin.ts                              ← super-admin email allowlist
  admin-server.ts                       ← server-side super-admin session guard
  auth.ts                               ← Better Auth server config
  auth-client.ts                        ← Better Auth browser client
  env.ts                                ← validated env vars
  slug.ts                               ← org slug generator
  knowledge/
    ai.ts                               ← geminiEmbed, geminiEmbedMany, geminiGenerate (9-model fallback chain)
    ingest.ts                           ← chunkText, fetchUrl, fetchGitHub, ingestText, ingestSource
    suggestions.ts                      ← missing-knowledge gap creation with 7-day exact-question dedupe

src/styles/
  theme.css                             ← global tokens, scroll-behavior: smooth on html
  index.css                             ← Tailwind entry
```

### Route layout nesting

- `(app)/layout.tsx` — auth guard only. Renders `{children}` directly.
- `(app)/(workspace)/layout.tsx` — org guard + `WorkspaceSidebar`. Wraps `/dashboard` and `/settings`.
- `(app)/products/[id]/layout.tsx` — product ownership guard + `ProductSidebar`. Wraps all per-product pages.
- These three layouts never share a sidebar: workspace routes get `WorkspaceSidebar`, product routes get `ProductSidebar`.

### Sidebar components

- `WorkspaceSidebar` — shows org name, "Products" link to `/dashboard`, "Settings" link, user/sign-out row.
- `ProductSidebar` — shows "← All products" back link, product name, per-product nav (Inbox, Knowledge, Widget, Analytics), user/sign-out row.
- Both are client components using `usePathname()` for active states.
- Neither sidebar is shared; do not merge them.

### Scroll behavior

- `scroll-behavior: smooth` is set on `html` in `src/styles/theme.css` — applies globally to all pages including the landing page.
- `data-scroll-behavior="smooth"` is set on the `<html>` element in `src/app/layout.tsx` — tells Next.js to preserve smooth scroll during client-side navigation.
- Sidebar layout `<main>` elements use `scroll-smooth` — ensures anchor links inside overflow-scroll containers also animate smoothly.

### Aspirational structure (add as features ship)

- `src/features/widget`
- `src/features/ai`
- `src/features/support-core`
- `src/features/agent-workspace`
- `src/features/admin`

## Component Reuse Rules

- Always check `src/components/ui` first before creating a new component.
- Always check `src/components` for an existing composed component before creating a new one.
- Prefer composing existing primitives over creating new UI abstractions.
- If a new component is required, it should be created only when reuse is clearly impossible or harmful.
- Do not duplicate buttons, cards, badges, dialogs, inputs, tables, or layout primitives that already exist.
- Extend existing components through props, composition, variants, and slots instead of cloning markup.
- Keep presentation logic small and local.

## Redundancy Rules

- Minimize duplication in UI, business logic, schemas, and types.
- Avoid parallel implementations of the same pattern.
- Prefer shared utilities only when they remove real duplication without making the code harder to follow.
- Prefer simple, direct code over clever abstractions.
- Write the least code needed for a robust solution.
- Reuse the best existing code before introducing new code.
- If there is already a correct implementation in the repo, adapt it instead of rewriting it.

## Engineering Standards

- Favor server-first patterns where appropriate.
- Keep client components as small as possible.
- Avoid unnecessary state, effects, wrappers, and custom hooks.
- Avoid premature abstractions.
- Prefer typed boundaries between features.
- Prefer explicit domain models over ad hoc object shapes.
- Build features end-to-end, but in thin vertical slices.
- Keep code readable, direct, and production-oriented.
- Inspect the current codebase state before answering implementation or architecture questions.
- Ground recommendations in the actual repository contents, not assumptions about intended structure.
- Prefer one shared semantic token system for both marketing and dashboard surfaces.
- Marketing and dashboard may differ in composition, but not in core theme contract.

## Collaboration Rules

- The user does not want to write code manually.
- Agents should assume full implementation ownership for code, config, and wiring tasks unless the user explicitly asks to take over.
- Do not tell the user to implement code that the agent can implement directly.
- Ask only for product decisions, credentials, approvals, or information that cannot be discovered safely from the repository.

## Data Modeling Rules

The Better Auth tables live in `src/db/schema.ts` and are the source of truth for identity and tenancy:

- `user` — identity (from Better Auth core, extended by the Admin plugin with `role`, `banned`, `ban_reason`, and `ban_expires`)
- `session` — active sessions (from Better Auth core, extended by the Admin plugin with `impersonated_by`)
- `account` — credential rows (password hash or OAuth tokens, one per provider per user)
- `verification` — email verification and password reset tokens
- `organization` — tenant (the Supo "workspace" concept lives here)
- `member` — user-in-organization with role
- `invitation` — pending invites to an organization

App-owned tables currently in `src/db/schema.ts`:

- `product` — a product owned by an `organization`. All per-product features (widget, inbox, knowledge, analytics) are scoped under a product. Columns: `id`, `organization_id`, `name`, `description`, `category`, `url`, `embedding_model`, `created_at`, `updated_at`. The `embedding_model` column stores the locked-in Gemini embedding model for this product — set on first index and never changed, to prevent vector space mismatch.
- `widget_config` — one-to-one with `product` via `product_id`. Stores bot name, greeting, position, theme, accent color. The `product_id` column has a UNIQUE constraint enforcing the 1:1 relationship.
- `customer` — org-scoped. Represents the end-user who initiates support conversations. Columns: `id`, `organization_id`, `name`, `email`, `created_at`.
- `conversation` — product-scoped. A support thread between a customer and the product's support surface. Columns: `id`, `product_id`, `customer_id`, `status` (open/resolved/snoozed), `assignee_id`, `ai_handled`, `subject`, `last_message_at`, `created_at`, `updated_at`.
- `message` — conversation-scoped. Individual messages within a conversation. Columns: `id`, `conversation_id`, `body`, `sender_type` (customer/ai/agent), `sender_id`, `created_at`.
- `knowledge_source` — product-scoped. A single knowledge source. Columns: `id`, `product_id`, `type` (article/url/github/conversation/sitemap), `name`, `url`, `content`, `status` (pending/indexing/indexed/error), `error_message`, `chunk_count`, `content_hash` (SHA-256 of last fetched content for change detection), `last_checked_at` (last time content was fetched and compared by cron), `created_at`, `updated_at`. The `"sitemap"` type is auto-created when a product is created with a URL — it crawls multiple pages discovered via sitemap.xml.
- `knowledge_suggestion` — product-scoped. Review queue for proposed KB updates generated from support conversations and missing-knowledge detection. Columns: `id`, `product_id`, `source_conversation_id`, `approved_source_id`, `status` (pending/approved/rejected), `kind` (faq/gap), `confidence`, `question`, nullable `answer`, nullable `content`, `reason`, `review_note`, `reviewed_by_id`, `reviewed_at`, `created_at`, `updated_at`. FAQ suggestions must include real answer/content. Gap suggestions intentionally start without answer/content and cannot be approved until a reviewer saves a real answer. Approval creates and links a `knowledge_source`; rejection preserves the draft and audit state.
- `knowledge_chunk` — source-scoped (denormalized `product_id` for fast search). Stores one text chunk with its pgvector embedding. Columns: `id`, `source_id`, `product_id`, `content`, `embedding` (vector(768)), `metadata` (JSON: title/url/chunkIndex), `created_at`. Has an HNSW index on `embedding` using cosine distance.
- `admin_audit_log` — super-admin audit trail. Columns: `id`, `admin_user_id`, `target_user_id`, `target_organization_id`, `action`, `metadata`, `ip_address`, `user_agent`, `created_at`. Admin actions must write this table for session revocation, ban, unban, and other high-risk operations.

### Tenancy model

There are two tenancy scopes in the product:

1. **Workspace-scoped** (org-level): tables that belong directly to `organization`. Use `organization_id text not null references organization(id) on delete cascade`. Examples: `product`, future `team_settings`.
2. **Product-scoped**: tables that belong to a `product`. Use `product_id text not null references product(id) on delete cascade`. Examples: `widget_config`, future `knowledge_sources`, `conversations`, `messages`.

Do not attach product-scoped data directly to `organization_id` — it must go through the `product` table.

### Remaining entities to add as features ship

- `conversation_participants` (product-scoped)
- `tickets` (product-scoped)
- `ticket_assignments` (product-scoped)
- `tags` (product-scoped)
- `conversation_tags` (product-scoped)
- `automations` (product-scoped)
- `events` (product-scoped)

Every app-owned table must:
- Use `text` primary keys with `crypto.randomUUID()` for consistency with the auth tables.
- Include the appropriate tenancy FK (`organization_id` or `product_id`) with `on delete cascade`.
- Not duplicate the role/membership concepts already provided by the organization plugin.

## Migration and Database Rules

- Use Drizzle schema and migrations as the source of truth.
- Keep SQL and schema changes reviewable and explicit.
- Do not hide important database behavior behind opaque tooling.
- Design indexes intentionally.
- Add constraints early.
- Treat multi-tenancy and auditability as core requirements, not later add-ons.
- Prefer code-first schema evolution for this project because the database is new.
- When schema files change, generate and apply migrations in the same body of work when feasible.
- If the database layer changes materially, update `AGENTS.md` to reflect the new source-of-truth files and commands.
- `bun run db:generate` requires a TTY to resolve column rename conflicts interactively. If running in a non-TTY environment (CI, agent shells), write the migration SQL and snapshot manually and record the hash in `drizzle.__drizzle_migrations` after applying it.
- Applied migrations: `0000_loving_gambit` (Better Auth tables), `0001_simple_sally_floyd` (widget_config with org_id), `0002_products_architecture` (product table + widget_config → product_id), `0003_inbox_tables` (customer, conversation, message tables), `0004_knowledge_base` (knowledge_source + knowledge_chunk tables, product.embedding_model column, pgvector extension + HNSW index), `0005_auto_sync` (content_hash + last_checked_at columns on knowledge_source), `0006_knowledge_suggestions` (knowledge_suggestion review queue), `0007_knowledge_gap_suggestions` (gap kind + nullable answer/content for missing-knowledge review), `0008_better_auth_admin` (Better Auth Admin plugin fields), `0009_admin_audit_log` (super-admin action audit trail).

## Theme Rules

- Use one global light/dark theme system for the entire app.
- Default theme behavior is `system` with a manual toggle.
- Persist theme choice through the theme library, not custom local state.
- Theme tokens in `src/styles/theme.css` are the source of truth for both marketing and dashboard surfaces.
- Do not create separate page-level color systems when the shared token system can be extended instead.
- New frontend work should consume semantic tokens and shared UI primitives before introducing custom styling layers.
- When integrating external design exports, port them into the shared token system and existing `src/components/ui` primitives instead of importing duplicate button/card systems.

## Visual Design Language

This section is the strict, enforceable contract for every UI surface in the product. The landing page in `src/components/*Section.tsx` is the reference implementation — when in doubt, match those files. Agents must not drift from these rules without explicit user approval.

### Aesthetic Summary

Dark-first, pure neutral palette: black background, white foreground, four-step gray ramp for surfaces and text. No brand-color accents in chrome or content. Flat, crisp, high-contrast — inspired by Vercel/Linear, not SaaS gradients. The system must also render correctly in light mode through the same tokens.

### Surface Hierarchy (use these, in this order)

- `bg-background` — page background (`#000000` dark / `#f6f7fb` light).
- `bg-card` — the first layer above background: section cards, nav, code blocks.
- `bg-[color:var(--card-elevated)]` — the second layer: cards nested inside cards, highlighted pricing tier, dashboard preview tiles.
- Do not invent a third surface level. Reach for `--card-elevated` and stop.

### Border and Radius

- Standard border: `border-border` (`#262626` dark). Use `border-t border-border` to separate stacked sections.
- Inner/subtle border: `border-[color:var(--border-subtle)]` (`#1a1a1a` dark) — only for elements nested inside a card.
- Radius: `rounded-lg` for cards, buttons, code blocks, inputs. `rounded-full` only for pills, toggles, status dots, and avatars. Do not use `rounded-xl` or larger on marketing surfaces.

### Text Hierarchy

- `text-foreground` — headlines, emphasized labels, active states.
- `text-[color:var(--text-secondary)]` — body copy, inactive nav links, section labels, descriptions.
- `text-[color:var(--text-tertiary)]` — footer copyright, fine print, metadata.
- Do not use `text-muted-foreground` on marketing surfaces when `--text-secondary` is the correct token. The `--text-*` ladder is purpose-built for landing-page typography.

### Typography

- Hero headline: `text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight`.
- Section headline: `text-3xl md:text-4xl font-bold tracking-tight`.
- Section label (above each headline): `text-sm text-[color:var(--text-secondary)] mb-3`, sentence case, left-aligned.
- Body copy: `text-base leading-relaxed` or `text-sm leading-relaxed` in dense grids.
- Fine print: `text-xs`.
- Do not use `uppercase tracking-[...]` labels, all-caps `PLATFORM FEATURES` eyebrows, or colored accent text for section labels.

### Spacing and Layout

- Horizontal section padding: `px-6`. Vertical section padding: `py-24`.
- Container widths:
  - Hero content: `max-w-5xl`.
  - Most sections: `max-w-7xl`.
  - Pricing grid inner: `max-w-6xl`.
  - Centered CTA banner and testimonial header: `max-w-4xl`.
- Sections are left-aligned by default. Only the CTA banner is centered.
- Section dividers are top borders, not full-width horizontal rules or decorative elements.

### Cards (Marketing Surfaces)

- Use a plain div: `<div className="rounded-lg border border-border bg-card p-6">`.
- Hover elevation: `hover:bg-[color:var(--card-elevated)] transition-colors duration-200`.
- Do not use the shadcn `Card` / `CardContent` components on marketing surfaces — they ship `gap-6`, extra padding, and `text-card-foreground` that conflict with this layout. Shadcn `Card` is fine inside the dashboard (`(app)` routes).
- Do not use glassmorphism (`backdrop-blur`, `bg-white/5`, `bg-[color:var(--glass-background)]`) on marketing surfaces. Glass is reserved for the fixed navbar only: `bg-background/80 backdrop-blur-xl`.

### Buttons

Compose the existing shadcn `Button` from `src/components/ui/button` with className overrides. Do not create a new Button primitive.

- **Primary** (white on black / black on white): `<Button className="rounded-lg bg-foreground text-background hover:bg-foreground/90">`.
- **Ghost** (muted text, subtle hover): `<Button variant="ghost" className="rounded-lg text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground">`.
- **Outline** (secondary card actions): `<Button variant="outline" className="rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:text-foreground">`.
- Always `rounded-lg`. Do not introduce brand-colored CTA buttons (no indigo, no gradient fill) on marketing surfaces.

### Icons

- All icons come from `lucide-react`.
- Marketing icons are monochrome: `text-foreground` for emphasis, `text-[color:var(--text-secondary)]` for decorative.
- Feature-grid icons sit directly on the card with no background tile. Do not wrap icons in colored squares (`bg-primary/10`, `bg-indigo-500/10`, etc.).
- Use `size-4` / `size-5` for inline icons. Reserve `size-6+` for hero/illustrative contexts.

### Motion

- Use `motion/react` (not `framer-motion`). Components that use `motion.*` must be marked `"use client"`.
- Above-the-fold (hero): `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: <step> }}`.
- Below-the-fold: `initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}`.
- Grid item stagger: `transition={{ delay: index * 0.05 }}`.
- Do not introduce heavier animation libraries or hero-level parallax effects.

### Navigation and Links

- Use `Link` from `next/link` for every internal navigation, including in-page anchor links like `#features`.
- External links use a raw `<a>` with `target="_blank" rel="noopener noreferrer"`.

### Forbidden on Marketing Surfaces

These patterns appeared in earlier iterations and were intentionally removed. Do not reintroduce them without the user explicitly asking for a redesign:

- Indigo → cyan (or any gradient) banner backgrounds, including on the CTA banner.
- Colored `blur-[120px]` decorative blobs behind sections.
- "Most Popular" badges on pricing cards; the highlight is a single `card-elevated` background, nothing else.
- Star-rating rows, avatar thumbnails, company-logo chips, or horizontal-scroll carousels in testimonials.
- Icon tiles with colored backgrounds (`bg-primary/10` squares around lucide icons).
- Glassmorphism anywhere other than the navbar.
- Centered `text-center` section headers anywhere other than the CTA banner.
- Uppercase all-caps section eyebrows in a colored accent.
- Using `shadcn Card` / `CardContent` on landing sections.
- Using `--primary` or `--accent` color tokens for CTA fills on marketing surfaces. White-on-black is the primary CTA.

### When to Deviate

- If a future section genuinely needs a new pattern, add it to this section of `AGENTS.md` in the same PR — do not let unwritten conventions accumulate.
- If the user explicitly asks for a redesign, update this section to match the new language before porting components, so that later agents do not revert to the old rules.

### Source-of-Truth Reference

When porting new sections or building dashboard screens, read these files as the canonical examples before writing a new one:

- `src/components/HeroSection.tsx` — hero pattern, stat row, preview card nesting.
- `src/components/FeaturesSection.tsx` — left-aligned label + headline, 3-column neutral grid.
- `src/components/APIPlayground.tsx` — left/right split, tabbed code card.
- `src/components/PricingSection.tsx` — left-aligned header, simple toggle, highlighted tier via `card-elevated`.
- `src/components/TestimonialsSection.tsx` — flat quote card, no ornamentation.
- `src/components/CTABanner.tsx` — the only centered section, still flat black.
- `src/components/Footer.tsx` — 5-column grid with muted link treatment.
- `src/components/Navbar.tsx` — the only surface allowed to use `bg-background/80 backdrop-blur-xl`.

## AI Knowledge Stack

### Packages

- `ai` (Vercel AI SDK v6) — unified interface for embed, embedMany, generateText, and streamText
- `@ai-sdk/google` — Google provider; used for both generation and embeddings via `createGoogleGenerativeAI`

### Generation model chain

`src/lib/knowledge/ai.ts` maintains a 9-model fallback chain ranked by 2026 benchmarks. Models are tried in order; the chain exhausts before throwing, so the app never hard-crashes on a single model error:

```
gemini-3-flash → gemini-3.1-flash-lite → gemini-2.5-flash →
gemma-4-31b → gemma-4-26b → gemini-2.5-flash-lite →
gemma-3-27b → gemma-3-12b → gemma-3-4b
```

All calls go through `geminiGenerate(prompt, systemPrompt)` — do not call the Google SDK directly elsewhere.

### Embedding model lock-in

One embedding model is assigned per product and stored in `product.embedding_model`. It is set on the first ingest call and **never changed** — mixing models within a product corrupts vector space and breaks retrieval.

- Both available models (`gemini-embedding-2-preview`, `gemini-embedding-001`) default to **3072 dims**. We pin to **768 dims** via `outputDimensionality: 768` so vectors fit the `vector(768)` schema column and stay within pgvector's 2000-dim HNSW index limit.
- Preferred model: `gemini-embedding-2-preview` — officially supports `outputDimensionality` (custom dimensions).
- Fallback model: `gemini-embedding-001` — does not officially support custom dimensions; only used if the preview model is unavailable.
- `text-embedding-004` is discontinued — do not use it.
- `resolveEmbeddingModel(productId)` checks an in-memory cache first, then the DB, then probes models on first call. The probe uses `outputDimensionality: 768` to confirm the model can emit the target dimension.
- All embedding calls go through `geminiEmbed` / `geminiEmbedMany` — never call `google.embedding()` directly elsewhere.
- `geminiEmbed` uses `taskType: "RETRIEVAL_QUERY"` — optimized for matching against stored chunks.
- `geminiEmbedMany` uses `taskType: "RETRIEVAL_DOCUMENT"` — optimized for being retrieved by queries.
- Changing `EMBED_DIMENSIONS` requires a schema migration and full re-index of all products.

### Ingestion pipeline

`src/lib/knowledge/ingest.ts`:
- `chunkText(text)` — paragraph-based split, ~800 char chunks, 200-char overlap
- `computeHash(text)` — SHA-256 of text, hex-encoded (Web Crypto, no deps); stored in `content_hash` after each index
- `fetchUrl(url)` — fetch → strip HTML → max 100KB plain text
- `fetchGitHub(repoUrl)` — fetches README + `docs/` `.md` files from public repos via GitHub Contents API (max 20 files, no auth needed)
- `discoverSitemapUrls(rootUrl)` — finds up to 30 same-domain URLs via sitemap.xml; falls back to extracting `<a href>` links from the root page
- `ingestText(text, sourceId, productId, metadata)` — chunk → embed (batch 100 in `geminiEmbedMany`) → insert; does NOT touch source status
- `ingestSource(sourceId, productId)` — full re-index; dispatches by type (includes `"sitemap"`); prepares all replacement chunks before deleting existing chunks, then swaps chunks and updates source metadata inside one DB transaction
- `ingestSourceIfChanged(sourceId, productId)` — used by cron: fetches current content, hashes it, compares to stored hash. Returns `"skipped"` if unchanged (only updates `last_checked_at`), `"reindexed"` if changed, `"error"` on fetch failure
- Safe re-index rule: previously indexed sources must remain queryable if a later fetch/embed/index attempt fails. Do not delete old chunks or set an already-indexed source to `error` before the replacement index has been successfully prepared and committed.

### Knowledge automation roadmap

Build this in prompt-by-prompt slices, in this order, so the knowledge system becomes deliberate instead of a vague feature pile:

1. Implemented: `knowledge_suggestion` stores proposed KB updates with product scope, source conversation, draft question/answer/content, status, confidence, reviewer metadata, and optional approved source linkage.
2. Implemented: resolving a conversation attempts to generate a pending `knowledge_suggestion` from the transcript after the status update succeeds. Suggestion generation failures must not block resolving the conversation.
3. Implemented: pending suggestions are shown on the Knowledge page above Sources using `SuggestionList`, with confidence, reason, source conversation/customer metadata, and a detail dialog.
4. Implemented: suggestions can be approved or rejected from the Knowledge page. Approval creates a `knowledge_source` of type `"conversation"`, links it through `approved_source_id`, marks the suggestion approved, and fires background ingestion. Rejection marks the suggestion rejected and preserves review metadata.
5. Safe re-indexing is already implemented in `src/lib/knowledge/ingest.ts`: prepare replacement chunks first, commit the chunk swap in a transaction, and keep the previous indexed chunks usable on failure.
6. Implemented: missing-knowledge detection creates pending `kind: "gap"` suggestions when widget chat or the Knowledge test panel finds no indexed chunks above the retrieval threshold. Gap suggestions store the real question with no placeholder answer/content, dedupe exact normalized questions for 7 days per product, and require a reviewer-saved answer before approval.

### Background ingestion pattern

Server actions fire-and-forget a `fetch()` to `/api/knowledge/ingest` and return immediately. The API route uses `export const maxDuration = 300` to support up to 5 minutes of ingestion work without blocking the UI. Auth is a shared `BETTER_AUTH_API_KEY` header (internal only).

### Auto-bootstrap on product creation

`createProduct` in `src/app/(app)/(workspace)/dashboard/actions.ts` automatically creates a `"sitemap"` knowledge source and fires background ingestion when a product URL is provided. Zero-touch: the developer just fills in the product URL during setup and the AI immediately starts learning about the product.

### Daily cron sync

`GET /api/cron/sync-knowledge` (auth: `x-api-key` header) runs nightly at 02:00 UTC via Vercel Cron (`vercel.json`). It queries all `url`/`github`/`sitemap` sources not checked in the last 23 hours and calls `ingestSourceIfChanged` on each sequentially. Sources whose content hash matches are skipped (no re-embedding). Returns `{ synced, skipped, errors, total }`. To test locally: `curl -H "x-api-key: <BETTER_AUTH_API_KEY>" http://localhost:3000/api/cron/sync-knowledge`.

### RAG query

`/api/knowledge/query` embeds the question, runs a pgvector cosine similarity search (`<=>` operator) to find top-5 chunks, builds a context prompt, calls `geminiGenerate`, and returns `{ answer, sources }`. The test Q&A panel in the knowledge UI calls the `testQuery` server action, which creates a pending `kind: "gap"` suggestion when no chunks meet the similarity threshold.

### Learn from conversation

`learnFromConversation(conversationId)` in `inbox/actions.ts` fetches the full message transcript, sends it to `geminiGenerate` with a FAQ extraction prompt, and creates a pending `knowledge_suggestion`. It returns `"created"` or `"existing"` and does not create or index a `knowledge_source` directly. The "Learn" button on resolved conversations now routes manual learning into the review queue. `resolveConversation(conversationId)` also attempts the same suggestion generation after updating the conversation status, but catches suggestion errors so resolving a conversation is never blocked by AI extraction.

## Chat API

### Endpoint

`POST /api/chat` — public, CORS fully open (`Access-Control-Allow-Origin: *`). Called by the embedded widget JS from any customer domain.

### Request

```json
{
  "productId": "...",
  "message": "How do I reset my password?",
  "conversationId": "...",
  "customer": { "name": "Jane Smith", "email": "jane@example.com" }
}
```

`conversationId` is omitted on the first message of a new session. The widget reads it from the `x-conversation-id` response header and passes it on all subsequent turns.

### Response

- **Body**: plain text stream (`text/plain`) — the AI reply streaming token by token. Consumed by the widget with a `ReadableStream` reader.
- **`x-conversation-id`** header: UUID of the conversation (new or existing). Widget stores this in session storage.
- **`x-sources`** header (optional): JSON array of `{ name, url }` objects when knowledge-base chunks were used. Widget may display source attribution.

### Flow

1. Validate required fields → 400 if missing.
2. Load product + widget config (bot name, greeting). → 404 if product not found.
3. Upsert customer by `email + organizationId` (email normalized to lowercase).
4. Get or create conversation. If `conversationId` is provided, verify it belongs to this product + customer. Re-open resolved/snoozed conversations when the customer messages again.
5. Insert the customer message.
6. Load last 20 messages for multi-turn context.
7. RAG: `geminiEmbed(message)` → pgvector cosine search → top-5 chunks with similarity ≥ 0.4. Silently skips if KB is empty or unavailable, and creates a pending missing-knowledge gap suggestion in the background when no relevant chunks are found.
8. Build system prompt: bot name + product description + KB context (with citation numbers) + behaviour rules.
9. `resolveGenerationModel()` → cached working model (10-min TTL, probed via `generateText` on cold start).
10. `streamText(model, system, messages)` → stream to client via `toTextStreamResponse()`.
11. `onFinish` callback inserts the AI message and updates `conversation.lastMessageAt`.

### Key decisions

- **No authentication**: productId is the only identifier. Add rate limiting (Upstash) when abuse becomes a concern.
- **Streaming over non-streaming**: `streamText` + `toTextStreamResponse()` gives plain text — simplest for a vanilla JS widget to consume without the AI SDK on the client.
- **Model selection**: `resolveGenerationModel()` probes the 9-model chain once per 10 minutes and caches the result. `streamText` can't fall back mid-stream, so the probe up-front is necessary.
- **Customer email normalization**: stored and looked up as lowercase to prevent duplicate customer records.
- **Conversation re-open**: a customer message on a resolved/snoozed conversation automatically re-opens it.

## Agent Instructions For Future Work

- Use `Supo` as the product name by default.
- Build toward the five-product architecture above.
- Prefer `Neon + Postgres 18 + Drizzle + Better Auth`.
- Do not introduce `Clerk` unless the user explicitly asks for it.
- Do not introduce Supabase unless the user explicitly asks for it.
- Do not introduce AWS services.
- Reuse prebuilt components before building new ones.
- Reduce redundancy aggressively.
- Choose the most efficient, maintainable implementation that uses the least code while preserving clarity.
- Do not create custom infrastructure or abstractions without a real need.
- When editing frontend code, preserve the established visual language unless the user asks for a redesign. The `## Visual Design Language` section is authoritative — read it before touching any UI file and follow it strictly.
- When adding a new component, explain briefly why an existing component could not be reused.
- Any new visual pattern not covered by `## Visual Design Language` must be added to that section in the same body of work, so later agents inherit the convention.
- Before answering questions about architecture or implementation, inspect the current repository state first.
- Keep repository instructions synchronized with real code structure, not aspirational structure only.
- Assume the user expects the agent to implement code directly rather than handing implementation back.
- Keep `AGENTS.md` updated when theme architecture, landing-page structure, or frontend source-of-truth files change.
- Whenever the architecture, stack decisions, product boundaries, or engineering rules change, update `AGENTS.md` in the same body of work so the file stays current.
- When a design is provided from Figma or another export, integrate the UI into the current app architecture instead of replacing working auth, DB, routing, or theme infrastructure wholesale.
- New product-scoped features (inbox, knowledge, conversations, analytics) go under `src/app/(app)/products/[id]/`. They get the `ProductSidebar` automatically from `products/[id]/layout.tsx`.
- New workspace-scoped features go under `src/app/(app)/(workspace)/`. They get the `WorkspaceSidebar` automatically from `(workspace)/layout.tsx`.
- Do not add a new sidebar component — extend `WorkspaceSidebar` or `ProductSidebar` instead.
- `embed code` in `WidgetConfigurator` uses `productId` (not `workspaceId` or `orgId`) as the identifier sent to `window.SupoSettings`. Any future widget loader must read `productId`.
