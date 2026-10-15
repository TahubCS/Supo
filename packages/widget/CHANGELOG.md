# Changelog

All notable changes to `@supoapp/widget` will be documented here.

## 0.1.0-alpha.9

- **Suggested articles:** when the product has a published help center, the empty chat shows up to three popular articles and a link to browse the help center. The config response gained `helpCenter` (`SupoHelpCenter` type).
- AI answers built from help center articles link to the public article.

## 0.1.0-alpha.8

- **Customer satisfaction (CSAT):** when an agent resolves a conversation the widget asks "How did we do?" with a 1–5 star rating and an optional comment.
- New headless method `submitRating(score, comment?)` and `getRating()`; new `rating` event (`{ requested, score }`), also available as `supo:rating` on `window`.
- The poll response's `ratingRequested` flag drives the prompt, so it also appears after a page reload.

## 0.1.0-alpha.7

- `Supo.init(...).on("message", handler)` now fires for messages received from the server (restored history, realtime and polling), once per message id.

## 0.1.0-alpha.6

- **Human handoff fixes:** customers can keep typing while waiting for an agent (the composer was disabled), and the AI keeps helping until someone joins.
- Conversation history (customer, AI, agent and system messages) is restored after a page reload, and live updates resume automatically. Previously a reload while waiting for an agent left the widget stuck.
- Lossless polling with a message sequence cursor (`after`); polling stops once realtime is connected and catches up after reconnects.
- Agent replies show the agent's name; "<agent> is typing…" indicator.
- When no agent is available the widget asks for a follow-up email (`submitFollowUpEmail()` on the headless client, `handoff` event).
- The "talk to a person" button is always available after the first message instead of only when the AI used certain phrases.
- `customer.userHash` for identity verification (HMAC-SHA256 of `externalId ?? email` with the product's identity secret).
- Messages are de-duplicated by server id (`x-message-id`, `x-ai-message-id`); a stale stored conversation is discarded instead of failing.
- Hooks and `supo:*` window events no longer fire twice.
- New headless methods: `resume()`, `submitFollowUpEmail()`, `getHandoff()`; new events: `typing`, `handoff`.
- Removed the "BETA" banner.

## 0.1.0-alpha.5

- AI answers now show the knowledge base articles they were based on as clickable source chips.
- Added `sendMessageWithSources()` to the headless client (returns `{ text, sources }`); `sendMessage()` is unchanged.
- `SupoMessage` gained an optional `sources` field, also populated from polling.
- Reads the `x-sources` response header as base64-encoded JSON (the server no longer sends raw JSON, which broke on non-ASCII titles).

## 0.1.0-alpha.4

- Added stable customer identity support through `customer.externalId`.
- Added `customer.id` as an accepted alias that normalizes to `externalId`.
- Made customer email optional when a stable external id is supplied.
- Updated widget storage keys to prefer `external:{externalId}` while preserving email-based alpha conversation keys.

## 0.1.0-alpha.3

- Changed the widget's "Powered by Supo" link to use the configured `apiBaseUrl` instead of a hardcoded Supo marketing URL.
- This makes self-hosted, preview, and deployment-specific widget installs link back to the correct Supo app.

## 0.1.0-alpha.2

- Added npm package README with React, vanilla TypeScript, headless, runtime API, and fallback script examples.
- Added package metadata for npm: description, license, homepage, repository, bugs, and keywords.
- Published under the official `@supoapp` npm scope.

## 0.1.0-alpha.1

- Initial alpha release of the Supo widget SDK.
- Added core browser widget runtime via `@supoapp/widget`.
- Added React helpers via `@supoapp/widget/react`.
- Added headless client via `@supoapp/widget/headless`.
- Added generated legacy global script support for CMS/no-code fallback embeds.
