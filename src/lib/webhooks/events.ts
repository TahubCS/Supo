// Client-safe list of webhook events (used by the settings UI and the API).

export const WEBHOOK_EVENTS = [
  "conversation.created",
  "conversation.escalated",
  "conversation.assigned",
  "conversation.resolved",
  "message.created",
  "rating.created",
  "article.published",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "conversation.created": "A customer starts a conversation",
  "conversation.escalated": "A conversation is handed to a human",
  "conversation.assigned": "A conversation is assigned or transferred",
  "conversation.resolved": "A conversation is resolved",
  "message.created": "A customer, AI or agent message is sent (not internal notes)",
  "rating.created": "A customer rates a conversation",
  "article.published": "A help center article is published",
};

export function normalizeEvents(input: unknown): WebhookEvent[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((e): e is WebhookEvent => WEBHOOK_EVENTS.includes(e as WebhookEvent)))];
}
