import * as Ably from "ably";

import { env } from "@/lib/env";
import {
  conversationChannelName,
  inboxChannelName,
  presenceChannelName,
} from "@/lib/realtime-channels";

let _rest: Ably.Rest | null = null;

type PresenceGetResult =
  | Ably.PresenceMessage[]
  | {
      items?: Ably.PresenceMessage[];
    };

function getRestClient(): Ably.Rest | null {
  if (!env.ABLY_API_KEY) return null;
  if (!_rest) _rest = new Ably.Rest(env.ABLY_API_KEY);
  return _rest;
}

export {
  conversationChannelName,
  inboxChannelName,
  presenceChannelName,
  productConversationsChannelPattern,
} from "@/lib/realtime-channels";

// Server-side publish helpers. Both are fire-and-forget safe — callers wrap
// in .catch(() => {}) so Ably failures never crash the user flow.
export async function publishToConversation(
  orgId: string,
  productId: string,
  convId: string,
  event: string,
  data: object,
): Promise<void> {
  const rest = getRestClient();
  if (!rest) return;
  await rest.channels
    .get(conversationChannelName(orgId, productId, convId))
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

export function isRealtimeConfigured(): boolean {
  return Boolean(env.ABLY_API_KEY);
}

// Distinct agents (not browser tabs) currently present in the product inbox.
// Returns null when presence is unknown (Ably not configured or unreachable).
export async function getOnlineAgentCount(orgId: string, productId: string): Promise<number | null> {
  const rest = getRestClient();
  if (!rest) return null;
  try {
    const result = (await rest.channels
      .get(presenceChannelName(orgId, productId))
      .presence.get()) as PresenceGetResult;
    // REST presence.get() returns PresenceMessage[] in practice; handle both shapes.
    const members = Array.isArray(result) ? result : (result?.items ?? []);
    return new Set(members.map((member) => member.clientId ?? member.connectionId)).size;
  } catch {
    return null;
  }
}

// Kept for the public presence endpoint used by older widget builds.
export async function getPresenceCount(orgId: string, productId: string): Promise<number> {
  return (await getOnlineAgentCount(orgId, productId)) ?? 0;
}

// Creates a short-lived, capability-restricted Ably TokenRequest.
// The token is scoped to exactly the channels the caller needs.
export async function createTokenRequest(
  capability: Record<string, string[]>,
  clientId: string,
): Promise<Ably.TokenRequest | null> {
  const rest = getRestClient();
  if (!rest) return null;
  // Ably SDK accepts capability as a JSON string; this avoids SDK type narrowing issues.
  return rest.auth.createTokenRequest({
    capability: JSON.stringify(capability),
    clientId,
    ttl: 3_600_000, // 1 hour
  });
}
