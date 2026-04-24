export type ConversationWithDetails = {
  id: string;
  productId: string;
  customerId: string;
  status: string;
  assigneeId: string | null;
  aiHandled: boolean;
  subject: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string };
  latestMessage: {
    id: string;
    body: string;
    senderType: string;
    createdAt: Date;
  } | null;
};
