# Supo REST API (v1)

Base URL: `https://<your-supo-host>/api/v1`

## Authentication

Create a key under **Product → Integrations → API keys**. Keys belong to one product and have explicit permissions (scopes). They are shown once and stored hashed.

```bash
curl https://<host>/api/v1/conversations \
  -H "Authorization: Bearer supo_sk_..."
```

`X-Api-Key: supo_sk_...` also works. Each key is rate limited to 600 requests per minute.

| Scope | Allows |
| --- | --- |
| `conversations:read` / `conversations:write` | Read conversations and messages / update them and post replies or notes |
| `customers:read` / `customers:write` | Read customers / create and update them |
| `knowledge:read` / `knowledge:write` | Search the knowledge base and list sources / add, re-index and delete sources |
| `articles:read` / `articles:write` | Read help center articles / create, edit, publish and delete them |

A `:write` scope includes the matching `:read` scope.

## Errors

Errors use HTTP status codes and a JSON body:

```json
{ "error": { "code": "invalid_request", "message": "priority must be one of low, normal, high, urgent" } }
```

Codes: `unauthorized` (401), `insufficient_scope` (403), `not_found` (404), `invalid_request` (400), `rate_limited` (429), `internal_error` (500).

## Pagination

List endpoints return `{ "data": [...], "nextCursor": "..." }`. Pass `cursor=<nextCursor>` for the next page; `nextCursor` is `null` on the last page. `limit` is 1–100 (default 25).

## Conversations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/conversations?status=open\|resolved\|snoozed&escalation=pending\|active` | Most recent activity first |
| GET | `/conversations/{id}` | Includes `customer` |
| PATCH | `/conversations/{id}` | `{ "status": "open" \| "resolved", "priority": "low" \| "normal" \| "high" \| "urgent", "tags": ["billing"] }`. Resolving notifies the customer and hands the chat back to the AI. Changing priority recomputes SLA targets. |
| GET | `/conversations/{id}/messages?after=<seq>&limit=&notes=false` | Oldest first; use `nextAfter` to continue. Internal notes are included unless `notes=false`. |
| POST | `/conversations/{id}/messages` | `{ "body": "...", "type": "reply" \| "note" }`. A reply is sent to the customer as "Support" and pauses the AI, like a human reply. A note is visible to agents only. |

## Customers

Customers belong to the workspace and are shared by its products.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/customers?email=&externalId=` | |
| POST | `/customers` | Upsert, matched by `externalId`, then `email`. Body: `{ externalId?, email?, name?, avatarUrl?, locale?, timezone? }`. Returns 201 when created. |
| GET | `/customers/{id}` | |
| PATCH | `/customers/{id}` | Same fields as POST |
| GET | `/customers/{id}/export` | Everything stored about the customer across the workspace: profile, conversations, messages, ratings (GDPR access request) |
| DELETE | `/customers/{id}` | Permanently erases the customer and all of their conversations in every product of the workspace, plus webhook logs that contain them (GDPR erasure). Returns 204. |

## Knowledge base

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/knowledge/sources` | |
| POST | `/knowledge/sources` | `{ "type": "article", "name": "...", "content": "..." }`, `{ "type": "url" \| "github", "name", "url" }` or `{ "type": "website", "name", "url", "maxPages": 50 }`. Indexing starts right away. |
| GET / DELETE | `/knowledge/sources/{id}` | |
| POST | `/knowledge/sources/{id}/reindex` | 202 Accepted |
| POST | `/knowledge/search` | `{ "query": "...", "limit": 6, "answer": true }` returns the matching passages (same retrieval as the widget) and, with `answer: true`, an AI-written answer with sources. |

## Help center articles

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/articles?status=draft\|published` | |
| POST | `/articles` | `{ "title", "bodyMd", "summary"?, "categoryId"?, "status": "draft" \| "published" }` |
| GET / PATCH / DELETE | `/articles/{id}` | PATCH accepts the same fields plus `slug`. Publishing adds the article to the knowledge base. |

## Webhooks

Add endpoints under **Product → Integrations → Webhooks**. Supo sends `POST` requests with a JSON body:

```json
{
  "id": "evt_3f2c...",
  "type": "conversation.escalated",
  "createdAt": "2026-10-15T12:00:00.000Z",
  "productId": "...",
  "data": { "conversation": { "id": "...", "status": "open", "escalationStatus": "pending", "customer": { "email": "..." } }, "reason": "customer_request" }
}
```

Events: `conversation.created`, `conversation.escalated`, `conversation.assigned`, `conversation.resolved`, `message.created`, `rating.created`, `article.published`. The **Send test** button sends a `ping` event.

Headers: `Supo-Event`, `Supo-Delivery` (unique per delivery; use `id` in the body to de-duplicate retries), and `Supo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.

Verify the signature against the **raw** body and reject old timestamps:

```js
import crypto from "node:crypto";

export function verify(secret, rawBody, header, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) <= toleranceSeconds;
  return fresh && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts.v1 ?? "", "hex"));
}
```

Respond with any 2xx status within 10 seconds. Other responses, timeouts and connection errors are retried with exponential backoff (30 s, 2 min, 8 min, 32 min, 2 h; 6 attempts in total). After 15 deliveries in a row fail for good, the endpoint is paused; turn it back on from the dashboard. Endpoints must use HTTPS and resolve to a public address, and redirects are not followed.
