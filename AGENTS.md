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
- Design every core table as multi-tenant with `workspace_id`
- Current DB connectivity uses `pg` + `drizzle-orm/node-postgres`
- Current shared DB entrypoint is `src/db/index.ts`
- Current Drizzle schema entrypoint is `src/db/schema.ts`
- Current Drizzle config file is `drizzle.config.ts`
- Current first app-owned table is `workspaces`

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
- Current Better Auth setup is backend-only and no auth UI pages have been intentionally built yet
- Current Better Auth setup uses the Drizzle adapter and `emailAndPassword`
- Current Better Auth Infrastructure integration uses the `dash()` plugin only

### Storage

- Prefer `Cloudflare R2` for attachments and uploaded assets

### Cache / Queue

- Add `Upstash Redis` only if needed for rate limiting, caching, jobs, or event buffering
- Do not introduce Redis before there is a clear product or performance need

## App Structure

Prefer this structure as the product grows:

- `src/app/(marketing)` for public pages
- `src/app/(app)` for authenticated product pages
- `src/app/api` for route handlers and backend entrypoints
- `src/db` for database connection and schema files
- `src/components/theme-provider.tsx` for the global theme provider
- `src/components/ThemeToggle.tsx` for the shared theme switcher
- `src/features/widget`
- `src/features/ai`
- `src/features/support-core`
- `src/features/agent-workspace`
- `src/features/admin`
- `src/components/ui` for reusable base UI primitives
- `src/components` only for shared composed components that are truly cross-feature
- `src/lib` for low-level utilities and integrations only

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

At minimum, the architecture should support these domain entities:

- workspaces
- users
- workspace_members
- customers
- conversations
- conversation_participants
- messages
- tickets
- ticket_assignments
- tags
- conversation_tags
- knowledge_sources
- knowledge_documents
- automations
- events

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

## Theme Rules

- Use one global light/dark theme system for the entire app.
- Default theme behavior is `system` with a manual toggle.
- Persist theme choice through the theme library, not custom local state.
- Theme tokens in `src/styles/theme.css` are the source of truth for both marketing and dashboard surfaces.
- Do not create separate page-level color systems when the shared token system can be extended instead.
- New frontend work should consume semantic tokens and shared UI primitives before introducing custom styling layers.
- When integrating external design exports, port them into the shared token system and existing `src/components/ui` primitives instead of importing duplicate button/card systems.

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
- When editing frontend code, preserve the established visual language unless the user asks for a redesign.
- When adding a new component, explain briefly why an existing component could not be reused.
- Before answering questions about architecture or implementation, inspect the current repository state first.
- Keep repository instructions synchronized with real code structure, not aspirational structure only.
- Assume the user expects the agent to implement code directly rather than handing implementation back.
- Keep `AGENTS.md` updated when theme architecture, landing-page structure, or frontend source-of-truth files change.
- Whenever the architecture, stack decisions, product boundaries, or engineering rules change, update `AGENTS.md` in the same body of work so the file stays current.
- When a design is provided from Figma or another export, integrate the UI into the current app architecture instead of replacing working auth, DB, routing, or theme infrastructure wholesale.
    
