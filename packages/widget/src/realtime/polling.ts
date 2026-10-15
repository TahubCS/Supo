import type { SupoEscalationStatus, SupoSource } from "../types";
import { joinUrl } from "../runtime/config";

export type SupoPollResponse = {
  messages: Array<{
    id: string;
    seq?: number;
    body: string;
    senderType: "customer" | "ai" | "agent" | "system";
    senderName?: string;
    createdAt: string;
    sources?: SupoSource[];
  }>;
  cursor?: number | null;
  escalationStatus: SupoEscalationStatus;
  needsEmail?: boolean;
  lastMessageAt: string;
};

export function buildPollUrl({
  apiBaseUrl,
  productId,
  conversationId,
  conversationToken,
  after,
}: {
  apiBaseUrl: string;
  productId: string;
  conversationId: string;
  conversationToken: string;
  // Last message seq already received; 0 fetches the full history.
  after: number;
}) {
  const url = new URL(joinUrl(apiBaseUrl, "/api/widget/messages/poll"));
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("conversationToken", conversationToken);
  url.searchParams.set("productId", productId);
  url.searchParams.set("after", String(after));
  return url.toString();
}
