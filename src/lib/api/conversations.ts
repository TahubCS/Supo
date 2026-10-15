// Conversation operations for the REST API (no dashboard session involved).
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import { postSystemMessage } from "@/lib/handoff/service";
import { applySlaTargets } from "@/lib/sla/service";
import { conversationData, emitConversationEvent, emitWebhookEvent, messageData } from "@/lib/webhooks/service";

import type { ApiContext } from "./auth";

export async function findApiConversation(ctx: ApiContext, conversationId: string) {
  return db.query.conversation.findFirst({
    where: and(eq(conversation.id, conversationId), eq(conversation.productId, ctx.productId)),
    with: { customer: { columns: { id: true, name: true, email: true, externalId: true } } },
  });
}

export type ApiConversation = NonNullable<Awaited<ReturnType<typeof findApiConversation>>>;

export function serializeConversation(conv: ApiConversation) {
  return conversationData(conv, conv.customer);
}

export async function resolveFromApi(ctx: ApiContext, conv: ApiConversation) {
  const now = new Date();
  await db
    .update(conversation)
    .set({
      status: "resolved",
      escalationStatus: null,
      aiHandled: true,
      assigneeId: null,
      unansweredStreak: 0,
      snoozedUntil: null,
      resolvedAt: now,
      resolvedById: null,
      updatedAt: now,
    })
    .where(eq(conversation.id, conv.id));
  await postSystemMessage({
    orgId: ctx.organizationId,
    productId: ctx.productId,
    conversationId: conv.id,
    body: "This conversation was marked as resolved. Send a message any time to reopen it.",
  });
  await Promise.allSettled([
    publishToConversation(ctx.organizationId, ctx.productId, conv.id, "escalation_update", { status: null, resolved: true }),
    publishToProductInbox(ctx.organizationId, ctx.productId, "conversation_updated", {
      conversationId: conv.id,
      status: "resolved",
      escalationStatus: null,
      assigneeId: null,
      aiHandled: true,
      resolvedAt: now.toISOString(),
    }),
  ]);
  await emitConversationEvent("conversation.resolved", conv.id, { resolvedBy: { apiKeyId: ctx.keyId, name: ctx.keyName } });
}

export async function reopenFromApi(ctx: ApiContext, conv: ApiConversation) {
  const now = new Date();
  await db
    .update(conversation)
    .set({ status: "open", snoozedUntil: null, resolvedAt: null, updatedAt: now })
    .where(eq(conversation.id, conv.id));
  await publishToProductInbox(ctx.organizationId, ctx.productId, "conversation_updated", {
    conversationId: conv.id,
    status: "open",
    resolvedAt: null,
  }).catch(() => {});
}

export async function updateFieldsFromApi(
  ctx: ApiContext,
  conv: ApiConversation,
  fields: { priority?: string; tags?: string[] },
) {
  if (fields.priority === undefined && fields.tags === undefined) return;
  await db
    .update(conversation)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(conversation.id, conv.id));
  const targets = fields.priority !== undefined && conv.escalatedAt ? await applySlaTargets(conv.id) : null;
  await publishToProductInbox(ctx.organizationId, ctx.productId, "conversation_updated", {
    conversationId: conv.id,
    ...fields,
    ...(targets
      ? {
          firstResponseDueAt: targets.firstResponseDueAt?.toISOString() ?? null,
          resolutionDueAt: targets.resolutionDueAt?.toISOString() ?? null,
        }
      : {}),
  }).catch(() => {});
}

/**
 * Posts a reply (shown to the customer, pauses the AI like a human reply) or
 * an internal note (agents only).
 */
export async function postMessageFromApi(ctx: ApiContext, conv: ApiConversation, body: string, type: "reply" | "note") {
  const id = crypto.randomUUID();
  const senderType = type === "note" ? "note" : "agent";
  const [saved] = await db
    .insert(message)
    .values({ id, conversationId: conv.id, body, senderType, senderId: null, createdAt: new Date() })
    .returning({ seq: message.seq, createdAt: message.createdAt });
  const event = { id, seq: saved.seq, body, senderType, senderName: "Support", createdAt: saved.createdAt.toISOString() };

  if (type === "note") {
    await publishToProductInbox(ctx.organizationId, ctx.productId, "note_added", {
      conversationId: conv.id,
      message: {
        id,
        conversationId: conv.id,
        body,
        senderType,
        senderId: null,
        senderName: `${ctx.keyName} (API)`,
        sources: null,
        createdAt: event.createdAt,
      },
    }).catch(() => {});
    return { id, seq: saved.seq, createdAt: saved.createdAt };
  }

  const now = saved.createdAt;
  await db
    .update(conversation)
    .set({
      status: "open",
      snoozedUntil: null,
      aiHandled: false,
      escalationStatus: "active",
      escalatedAt: conv.escalatedAt ?? now,
      handoffReason: conv.handoffReason ?? "agent",
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(conversation.id, conv.id));
  await db
    .update(conversation)
    .set({ firstResponseAt: now })
    .where(and(eq(conversation.id, conv.id), isNull(conversation.firstResponseAt)));

  await Promise.allSettled([
    publishToConversation(ctx.organizationId, ctx.productId, conv.id, "message", event),
    conv.escalationStatus !== "active"
      ? publishToConversation(ctx.organizationId, ctx.productId, conv.id, "escalation_update", { status: "active", agentName: null })
      : Promise.resolve(),
    publishToProductInbox(ctx.organizationId, ctx.productId, "conversation_updated", {
      conversationId: conv.id,
      status: "open",
      escalationStatus: "active",
      aiHandled: false,
      lastMessageAt: event.createdAt,
      latestMessage: event,
    }),
  ]);
  await emitWebhookEvent(
    ctx.productId,
    "message.created",
    messageData({ id, conversationId: conv.id, senderType: "agent", body, createdAt: now }),
  );
  return { id, seq: saved.seq, createdAt: now };
}
