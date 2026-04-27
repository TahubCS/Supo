"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { conversation, knowledgeSuggestion, member, message } from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import { auth } from "@/lib/auth";
import { geminiGenerate } from "@/lib/knowledge/ai";
import { requireSecurityQuota } from "@/lib/security";

type MessageRow = typeof message.$inferSelect;
type SuggestionResult = "created" | "existing";
type ExtractedSuggestion = {
  question: string;
  answer: string;
  reason?: string;
  confidence?: number;
};
type LifecycleUpdate = {
  organizationId: string;
  productId: string;
  conversationId: string;
  status: string;
  escalationStatus: string | null;
  aiHandled?: boolean;
  lastMessageAt?: Date;
  latestMessage?: {
    id: string;
    body: string;
    senderType: string;
    createdAt: Date;
  };
  notifyWidget?: boolean;
};

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

function publishConversationLifecycleUpdate({
  organizationId,
  productId,
  conversationId,
  status,
  escalationStatus,
  aiHandled,
  lastMessageAt,
  latestMessage,
  notifyWidget = false,
}: LifecycleUpdate): Promise<void> {
  const inboxPayload = {
    conversationId,
    status,
    escalationStatus,
    aiHandled,
    lastMessageAt: lastMessageAt?.toISOString(),
    latestMessage: latestMessage
      ? {
          ...latestMessage,
          createdAt: latestMessage.createdAt.toISOString(),
        }
      : undefined,
  };

  const publishes: Promise<void>[] = [
    publishToProductInbox(
      organizationId,
      productId,
      "conversation_updated",
      inboxPayload,
    ),
  ];

  if (notifyWidget) {
    publishes.push(
      publishToConversation(organizationId, conversationId, "escalation_update", {
        status: escalationStatus,
      }),
    );
  }

  return Promise.allSettled(publishes).then(() => undefined);
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
  const { conv, membership } = await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "resolved", escalationStatus: null, updatedAt: now })
    .where(eq(conversation.id, conversationId));

  publishConversationLifecycleUpdate({
    organizationId: membership.organizationId,
    productId: conv.productId,
    conversationId,
    status: "resolved",
    escalationStatus: null,
    notifyWidget: true,
  }).catch(() => {});

  try {
    await createKnowledgeSuggestionFromConversation(conversationId);
  } catch {
    // Conversation resolution must not be blocked by AI extraction failures.
  }
}

export async function snoozeConversation(conversationId: string): Promise<void> {
  const { conv, membership } = await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "snoozed", escalationStatus: null, updatedAt: now })
    .where(eq(conversation.id, conversationId));

  publishConversationLifecycleUpdate({
    organizationId: membership.organizationId,
    productId: conv.productId,
    conversationId,
    status: "snoozed",
    escalationStatus: null,
    notifyWidget: true,
  }).catch(() => {});
}

export async function reopenConversation(conversationId: string): Promise<void> {
  const { conv, membership } = await verifyConversationAccess(conversationId);
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "open", escalationStatus: null, updatedAt: now })
    .where(eq(conversation.id, conversationId));

  publishConversationLifecycleUpdate({
    organizationId: membership.organizationId,
    productId: conv.productId,
    conversationId,
    status: "open",
    escalationStatus: null,
    notifyWidget: true,
  }).catch(() => {});
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<void> {
  const { session, conv, membership } = await verifyConversationAccess(conversationId);
  const headerList = await headers();
  await requireSecurityQuota("inbox.agent.user.hour", session.user.id, {
    userId: session.user.id,
    organizationId: membership.organizationId,
    productId: conv.productId,
    headerList,
    path: "/inbox/send-message",
    method: "POST",
  });
  const now = new Date();
  const newMsgId = crypto.randomUUID();

  await db.insert(message).values({
    id: newMsgId,
    conversationId,
    body,
    senderType: "agent",
    senderId: session.user.id,
    createdAt: now,
  });

  await db
    .update(conversation)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      aiHandled: false,
      // Upgrade pending → active on first agent reply; auto-assign to responder.
      escalationStatus: "active",
      assigneeId: session.user.id,
    })
    .where(eq(conversation.id, conversationId));

  // Publish real-time events to widget and any other agents viewing this thread.
  Promise.allSettled([
    publishToConversation(membership.organizationId, conversationId, "message", {
      id: newMsgId,
      body,
      senderType: "agent",
      senderName: session.user.name,
      createdAt: now.toISOString(),
    }),
    publishToConversation(membership.organizationId, conversationId, "escalation_update", {
      status: "active",
    }),
    publishConversationLifecycleUpdate({
      organizationId: membership.organizationId,
      productId: conv.productId,
      conversationId,
      status: "open",
      escalationStatus: "active",
      aiHandled: false,
      lastMessageAt: now,
      latestMessage: {
        id: newMsgId,
        body,
        senderType: "agent",
        createdAt: now,
      },
    }),
  ]).catch(() => {});
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseExtractedSuggestion(raw: string): ExtractedSuggestion {
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? raw) as Partial<ExtractedSuggestion>;

  const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";

  if (!question || !answer) {
    throw new Error("Invalid FAQ shape");
  }

  return {
    question,
    answer,
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : undefined,
    confidence: parsed.confidence,
  };
}

async function createKnowledgeSuggestionFromConversation(
  conversationId: string,
): Promise<SuggestionResult> {
  const { conv } = await verifyConversationAccess(conversationId);

  const existing = await db.query.knowledgeSuggestion.findFirst({
    where: eq(knowledgeSuggestion.sourceConversationId, conversationId),
  });
  if (existing) return "existing";

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
{ "question": "...", "answer": "...", "reason": "...", "confidence": 0 }
The question should be what the customer was asking.
The answer should be the correct solution.
The reason should briefly explain why this belongs in the knowledge base.
The confidence should be an integer from 0 to 100.`;

  const raw = await geminiGenerate(transcript, systemPrompt);

  let faq: ExtractedSuggestion;
  try {
    faq = parseExtractedSuggestion(raw);
  } catch {
    throw new Error("AI could not extract a FAQ from this conversation");
  }

  const content = `**Q: ${faq.question}**\n\n${faq.answer}`;
  const now = new Date();

  await db.insert(knowledgeSuggestion).values({
    id: crypto.randomUUID(),
    productId: conv.productId,
    sourceConversationId: conversationId,
    approvedSourceId: null,
    status: "pending",
    kind: "faq",
    confidence: clampConfidence(faq.confidence),
    question: faq.question,
    answer: faq.answer,
    content,
    reason: faq.reason ?? null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return "created";
}

export async function learnFromConversation(conversationId: string): Promise<SuggestionResult> {
  return createKnowledgeSuggestionFromConversation(conversationId);
}
