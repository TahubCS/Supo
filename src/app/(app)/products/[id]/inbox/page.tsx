import { and, desc, eq, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { InboxView } from "./InboxView";
import type { ConversationWithDetails } from "./types";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "inbox")) notFound();

  const conversations = await db.query.conversation.findMany({
    where:
      access.role === "agent"
        ? and(
            eq(conversation.productId, id),
            or(
              eq(conversation.assigneeId, access.session.user.id),
              and(
                eq(conversation.escalationStatus, "pending"),
                isNull(conversation.assigneeId),
              ),
            ),
          )
        : eq(conversation.productId, id),
    with: { customer: { columns: { id: true, name: true, email: true } } },
    orderBy: [desc(conversation.lastMessageAt)],
  });

  const withMessages: ConversationWithDetails[] = await Promise.all(
    conversations.map(async (conv) => {
      const latest = await db.query.message.findFirst({
        where: eq(message.conversationId, conv.id),
        orderBy: [desc(message.createdAt)],
        columns: { id: true, body: true, senderType: true, createdAt: true },
      });
      return {
        ...conv,
        latestMessage: latest ?? null,
      };
    }),
  );

  return (
    <InboxView
      conversations={withMessages}
      productId={id}
      orgId={access.product.organizationId}
      userName={access.session.user.name}
      currentUserId={access.session.user.id}
      productRole={access.role}
    />
  );
}
