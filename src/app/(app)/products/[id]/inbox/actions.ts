"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { conversation, member, message, product } from "@/db/schema";
import { auth } from "@/lib/auth";

type MessageRow = typeof message.$inferSelect;

async function verifyConversationAccess(conversationId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    with: { product: true },
  });
  if (!conv) throw new Error("Not found");
  if (conv.product.organizationId !== membership.organizationId) {
    throw new Error("Not found");
  }

  return { session, conv, membership };
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    with: { product: true },
  });
  if (!conv || conv.product.organizationId !== membership.organizationId) {
    throw new Error("Not found");
  }

  return db.query.message.findMany({
    where: eq(message.conversationId, conversationId),
    orderBy: [asc(message.createdAt)],
  });
}

export async function resolveConversation(conversationId: string): Promise<void> {
  await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "resolved", updatedAt: now })
    .where(eq(conversation.id, conversationId));
}

export async function snoozeConversation(conversationId: string): Promise<void> {
  await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "snoozed", updatedAt: now })
    .where(eq(conversation.id, conversationId));
}

export async function reopenConversation(conversationId: string): Promise<void> {
  await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "open", updatedAt: now })
    .where(eq(conversation.id, conversationId));
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<void> {
  const { session } = await verifyConversationAccess(conversationId);
  const now = new Date();

  await db.insert(message).values({
    id: crypto.randomUUID(),
    conversationId,
    body,
    senderType: "agent",
    senderId: session.user.id,
    createdAt: now,
  });

  await db
    .update(conversation)
    .set({ lastMessageAt: now, updatedAt: now, aiHandled: false })
    .where(eq(conversation.id, conversationId));
}
