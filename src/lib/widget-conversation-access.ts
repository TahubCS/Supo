import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { conversation } from "@/db/schema";

export function createConversationPublicAccessToken(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function findWidgetConversation({
  conversationId,
  productId,
  conversationToken,
  customerId,
}: {
  conversationId: string | null | undefined;
  productId: string;
  conversationToken: string | null | undefined;
  customerId?: string;
}) {
  const token = conversationToken?.trim();
  if (!conversationId || !token) return null;

  const conditions = [
    eq(conversation.id, conversationId),
    eq(conversation.productId, productId),
    eq(conversation.publicAccessToken, token),
  ];

  if (customerId) {
    conditions.push(eq(conversation.customerId, customerId));
  }

  return db.query.conversation.findFirst({
    where: and(...conditions),
  });
}
