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
- Current tables in `src/db/schema.ts` are the Better Auth core (`user`, `session`, `account`, `verification`) plus the organization plugin (`organization`, `member`, `invitation`). There are no app-owned tables yet.
- The `organization` table is the tenant anchor. Do not reintroduce a separate `workspaces` table — the earlier placeholder was dropped on purpose.

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
- Current Better Auth setup uses the Drizzle adapter with `emailAndPassword` enabled and social providers for Google and GitHub. Microsoft (Entra ID) is deferred until the user decides to configure the Azure app — the plumbing is structured so adding it is a two-field change in `auth.ts` + two env vars.
- The `organization` plugin is enabled on both server (`organization()`) and client (`organizationClient()`) — this is how Supo represents tenants, teams, roles, and invitations. Do not rebuild membership/invitation tables by hand.
- `trustedOrigins` is set to `[BETTER_AUTH_URL, "http://localhost:3000"]`. Any new deployed host must be added to this list.
- Current Better Auth Infrastructure integration uses the `dash()` plugin.
- Required env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. `src/lib/env.ts` validates at import time — do not add optional unvalidated env access elsewhere.

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

The Better Auth tables live in `src/db/schema.ts` and are the source of truth for identity and tenancy:

- `user` — identity (from Better Auth core)
- `session` — active sessions (from Better Auth core)
- `account` — credential rows (password hash or OAuth tokens, one per provider per user)
- `verification` — email verification and password reset tokens
- `organization` — tenant (the Supo "workspace" concept lives here)
- `member` — user-in-organization with role
- `invitation` — pending invites to an organization

At minimum, the product architecture should support these additional app-owned entities (to be added as Drizzle tables with `organization_id` tenancy columns as each feature ships):

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

Every app-owned table above must:
- Include `organization_id text not null references organization(id) on delete cascade`.
- Use `text` primary keys with Better Auth's ID generator when the row can be owned by a user/organization, for consistency with the auth tables.
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
    
