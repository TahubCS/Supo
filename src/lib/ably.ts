import * as Ably from "ably";

import { env } from "@/lib/env";

let _rest: Ably.Rest | null = null;

function getRestClient(): Ably.Rest | null {
  if (!env.ABLY_API_KEY) return null;
  if (!_rest) _rest = new Ably.Rest(env.ABLY_API_KEY);
  return _rest;
}

// Channel name helpers — orgId embedded for multi-tenant isolation at scale.
export function conversationChannelName(orgId: string, convId: string) {
  return `org:${orgId}:conversation:${convId}`;
}

export function inboxChannelName(orgId: string, productId: string) {
  return `org:${orgId}:product:${productId}:inbox`;
}

export function presenceChannelName(orgId: string, productId: string) {
  return `org:${orgId}:product:${productId}:presence`;
}

// Server-side publish helpers. Both are fire-and-forget safe — callers wrap
// in .catch(() => {}) so Ably failures never crash the user flow.
export async function publishToConversation(
  orgId: string,
  convId: string,
  event: string,
  data: object,
): Promise<void> {
  const rest = getRestClient();
  if (!rest) return;
  await rest.channels
    .get(conversationChannelName(orgId, convId))
    .publish(event, { v: 1, ...data });
}

export async function publishToProductInbox(
  orgId: string,
  productId: string,
  event: string,
  data: object,
): Promise<void> {
  const rest = getRestClient();
  if (!rest) return;
  await rest.channels
    .get(inboxChannelName(orgId, productId))
    .publish(event, { v: 1, ...data });
}

// Returns the count of agents currently present in the product inbox.
// Used by the widget to show "N agents online" before escalation.
export async function getPresenceCount(orgId: string, productId: string): Promise<number> {
  const rest = getRestClient();
  if (!rest) return 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await rest.channels
      .get(presenceChannelName(orgId, productId))
      .presence.get()) as any;
    // REST presence.get() returns PresenceMessage[] in practice; handle both shapes.
    return Array.isArray(result) ? result.length : (result?.items?.length ?? 0);
  } catch {
    return 0;
  }
}

// Creates a short-lived, capability-restricted Ably TokenRequest.
// The token is scoped to exactly the channels the caller needs.
export async function createTokenRequest(
  capability: Record<string, string[]>,
): Promise<Ably.TokenRequest | null> {
  const rest = getRestClient();
  if (!rest) return null;
  // Ably SDK accepts capability as a JSON string; this avoids SDK type narrowing issues.
  return rest.auth.createTokenRequest({
    capability: JSON.stringify(capability),
    ttl: 3_600_000, // 1 hour
  });
}
