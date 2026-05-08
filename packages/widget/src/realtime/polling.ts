import type { SupoEscalationStatus } from "../types";
import { joinUrl } from "../runtime/config";

export type SupoPollResponse = {
  messages: Array<{ id: string; body: string; senderType: "customer" | "ai" | "agent"; createdAt: string }>;
  escalationStatus: SupoEscalationStatus;
  lastMessageAt: string;
};

export function buildPollUrl({
  apiBaseUrl,
  productId,
  conversationId,
  conversationToken,
  since,
}: {
  apiBaseUrl: string;
  productId: string;
  conversationId: string;
  conversationToken: string;
  since: string;
}) {
  const url = new URL(joinUrl(apiBaseUrl, "/api/widget/messages/poll"));
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("conversationToken", conversationToken);
  url.searchParams.set("productId", productId);
  url.searchParams.set("since", since);
  return url.toString();
}
