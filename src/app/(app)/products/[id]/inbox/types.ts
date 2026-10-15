import type { MessageSource } from "@/db/schema";

export type InboxMessage = {
  id: string;
  conversationId: string;
  body: string;
  senderType: string;
  senderId: string | null;
  senderName: string | null;
  sources: MessageSource[] | null;
  createdAt: Date;
};

export type ConversationWithDetails = {
  id: string;
  productId: string;
  customerId: string;
  status: string;
  assigneeId: string | null;
  aiHandled: boolean;
  escalationStatus: string | null;
  escalatedAt: Date | null;
  handoffReason: string | null;
  aiSummary: string | null;
  followUpEmail: string | null;
  identityVerified: boolean;
  snoozedUntil: Date | null;
  priority: string;
  tags: string[];
  channel: string;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  subject: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string | null };
  latestMessage: {
    id: string;
    body: string;
    senderType: string;
    createdAt: Date;
  } | null;
  // Customer satisfaction rating, once the customer has rated the conversation.
  rating: { score: number; comment: string | null } | null;
};
