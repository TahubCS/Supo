import * as Ably from "ably";

import { joinUrl } from "../runtime/config";

export type SupoRealtime = Ably.Realtime;
export type SupoRealtimeTokenResponse = Ably.TokenRequest & { channelName?: string };

export function buildRealtimeTokenUrl({
  apiBaseUrl,
  productId,
  conversationId,
  conversationToken,
}: {
  apiBaseUrl: string;
  productId: string;
  conversationId: string;
  conversationToken: string;
}) {
  const url = new URL(joinUrl(apiBaseUrl, "/api/widget/realtime/token"));
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("conversationToken", conversationToken);
  url.searchParams.set("productId", productId);
  return url.toString();
}

export function createRealtimeClient(authUrl: string): SupoRealtime {
  return new Ably.Realtime({ authUrl, authMethod: "GET" });
}
