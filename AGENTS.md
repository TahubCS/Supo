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

### Backend

- Next.js server components, server functions, and route handlers for the app backend
- Background jobs only when the feature actually needs async processing
- Keep the backend modular by feature, not by technical layer alone

### Database

- Use `Neon` as the primary Postgres provider
- Use `PostgreSQL 18` for new environments
- Design every core table as multi-tenant with `workspace_id`

### ORM

- Use `Drizzle ORM`
- Do not default to Prisma for this project
- Favor Drizzle for simpler SQL-first control, fewer moving parts, and better fit with Neon

### Auth

- Prefer `Better Auth` as the default authentication solution
- Do not default to `Clerk` for this project unless the user explicitly chooses it
- Keep auth decoupled from the database provider

### Storage

- Prefer `Cloudflare R2` for attachments and uploaded assets

### Cache / Queue

- Add `Upstash Redis` only if needed for rate limiting, caching, jobs, or event buffering
- Do not introduce Redis before there is a clear product or performance need

## App Structure

Prefer this structure as the product grows:

- `src/app/(marketing)` for public pages
- `src/app/(app)` for authenticated product pages
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
- Whenever the architecture, stack decisions, product boundaries, or engineering rules change, update `AGENTS.md` in the same body of work so the file stays current.
    
