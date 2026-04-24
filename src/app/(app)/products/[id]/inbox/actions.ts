"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { conversation, knowledgeSource, member, message, product } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { geminiGenerate } from "@/lib/knowledge/ai";

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

export async function learnFromConversation(conversationId: string): Promise<void> {
  const { conv } = await verifyConversationAccess(conversationId);

  const messages = await db.query.message.findMany({
    where: eq(message.conversationId, conversationId),
    orderBy: [asc(message.createdAt)],
  });

  if (messages.length === 0) throw new Error("No messages to learn from");

  const transcript = messages
    .map((m) => `${m.senderType.toUpperCase()}: ${m.body}`)
    .join("\n");

  const systemPrompt = `You are a knowledge base curator. Extract a clear FAQ entry from this support conversation.
Return ONLY a JSON object with this exact shape:
{ "question": "...", "answer": "..." }
The question should be what the customer was asking. The answer should be the correct solution.`;

  const raw = await geminiGenerate(transcript, systemPrompt);

  let faq: { question: string; answer: string };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    faq = JSON.parse(match?.[0] ?? raw);
    if (!faq.question || !faq.answer) throw new Error("Invalid FAQ shape");
  } catch {
    throw new Error("AI could not extract a FAQ from this conversation");
  }

  const content = `**Q: ${faq.question}**\n\n${faq.answer}`;
  const subject = conv.subject ?? faq.question.slice(0, 60);
  const now = new Date();
  const sourceId = crypto.randomUUID();

  await db.insert(knowledgeSource).values({
    id: sourceId,
    productId: conv.productId,
    type: "conversation",
    name: subject,
    url: null,
    content,
    status: "indexing",
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Fire ingestion in background
  fetch(`${env.BETTER_AUTH_URL}/api/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.BETTER_AUTH_API_KEY,
    },
    body: JSON.stringify({ sourceId, productId: conv.productId }),
  }).catch(() => {});
}
