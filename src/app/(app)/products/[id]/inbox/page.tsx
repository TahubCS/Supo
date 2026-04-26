import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { conversation, member, message, product } from "@/db/schema";
import { auth } from "@/lib/auth";

import { InboxView } from "./InboxView";
import type { ConversationWithDetails } from "./types";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) notFound();

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, id),
  });
  if (!foundProduct || foundProduct.organizationId !== membership.organizationId) {
    notFound();
  }

  const conversations = await db.query.conversation.findMany({
    where: eq(conversation.productId, id),
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
      orgId={foundProduct.organizationId}
      userName={session.user.name}
    />
  );
}
