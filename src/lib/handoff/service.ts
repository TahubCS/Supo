import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { conversation, message, product, user } from "@/db/schema";
import {
  getOnlineAgentCount,
  getOnlineAgentUserIds,
  publishToConversation,
  publishToProductInbox,
} from "@/lib/ably";
import { enqueueAndKick } from "@/lib/jobs/queue";

import { HANDOFF_REASON_LABELS } from "./policy";
import { pickRoundRobinAgent } from "./routing";

export type AgentAvailability = "online" | "offline" | "unknown";

export const HANDOFF_JOB_TYPES = {
  summarize: "conversation.summarize",
  notifyAgents: "handoff.notify_agents",
  notifyCustomer: "conversation.notify_customer",
} as const;

export async function getAgentAvailability(orgId: string, productId: string): Promise<AgentAvailability> {
  const online = await getOnlineAgentCount(orgId, productId);
  if (online === null) return "unknown";
  return online > 0 ? "online" : "offline";
}

type ConversationRef = { orgId: string; productId: string; conversationId: string };

/** Stores a system notice in the transcript and pushes it to the widget and agents. */
export async function postSystemMessage({
  orgId,
  productId,
  conversationId,
  body,
}: ConversationRef & { body: string }) {
  const now = new Date();
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(message)
    .values({ id, conversationId, body, senderType: "system", senderId: null, createdAt: now })
    .returning({ seq: message.seq });

  await Promise.allSettled([
    publishToConversation(orgId, productId, conversationId, "message", {
      id,
      seq: row?.seq,
      body,
      senderType: "system",
      createdAt: now.toISOString(),
    }),
  ]);
  return { id, createdAt: now };
}

function handoffNotice(availability: AgentAvailability, followUpEmail: string | null): string {
  if (availability === "offline") {
    return followUpEmail
      ? `Our team isn't online right now. We've passed your conversation on and will reply to ${followUpEmail} as soon as possible.`
      : "Our team isn't online right now. Leave your email below and we'll follow up as soon as possible.";
  }
  return "I've asked a member of our support team to join. You can keep chatting with me while you wait.";
}

/**
 * Round-robin routing: assigns a freshly escalated conversation to the least
 * busy online agent. Returns the assignee or null when routing is manual or
 * nobody is available.
 */
async function autoAssign(
  orgId: string,
  productId: string,
  conversationId: string,
): Promise<{ id: string; name: string } | null> {
  const settings = await db.query.product.findFirst({
    where: eq(product.id, productId),
    columns: { routingMode: true, maxConcurrentChats: true },
  });
  if (settings?.routingMode !== "round_robin") return null;

  const online = await getOnlineAgentUserIds(orgId, productId);
  if (!online || online.length === 0) return null;

  const loads = await db
    .select({ assigneeId: conversation.assigneeId, count: sql<number>`count(*)::int` })
    .from(conversation)
    .where(
      and(
        eq(conversation.productId, productId),
        eq(conversation.escalationStatus, "active"),
        inArray(conversation.assigneeId, online),
      ),
    )
    .groupBy(conversation.assigneeId);
  const counts = Object.fromEntries(loads.map((row) => [row.assigneeId ?? "", Number(row.count)]));
  // Shuffle so equally loaded agents share the work.
  const shuffled = [...online].sort(() => Math.random() - 0.5);
  const chosen = pickRoundRobinAgent(shuffled, counts, settings.maxConcurrentChats);
  if (!chosen) return null;

  const assigned = await db
    .update(conversation)
    .set({ assigneeId: chosen, escalationStatus: "active", updatedAt: new Date() })
    .where(and(eq(conversation.id, conversationId), isNull(conversation.assigneeId)))
    .returning({ id: conversation.id });
  if (assigned.length === 0) return null;

  const agent = await db.query.user.findFirst({ where: eq(user.id, chosen), columns: { id: true, name: true } });
  return agent ?? { id: chosen, name: "A teammate" };
}

export type EscalationResult = {
  escalated: boolean;
  escalationStatus: "pending" | "active" | null;
  availability: AgentAvailability;
  needsEmail: boolean;
};

/**
 * Moves a conversation into the human queue. Idempotent: returns
 * escalated=false when it was already pending or active.
 */
export async function escalateConversation({
  orgId,
  productId,
  conversationId,
  reason,
  subject,
  customerName,
  customerEmail,
}: ConversationRef & {
  reason: string;
  subject: string | null;
  customerName: string;
  customerEmail: string | null;
}): Promise<EscalationResult> {
  const now = new Date();
  const updated = await db
    .update(conversation)
    .set({
      status: "open",
      escalationStatus: "pending",
      escalatedAt: now,
      handoffReason: reason,
      aiHandled: false,
      assigneeId: null,
      handoffTimeoutNotifiedAt: null,
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(and(eq(conversation.id, conversationId), isNull(conversation.escalationStatus)))
    .returning({ followUpEmail: conversation.followUpEmail });

  const availability = await getAgentAvailability(orgId, productId);

  if (updated.length > 0 && availability === "offline") {
    // The offline notice already promises an email follow-up; mark it so the
    // wait-timeout notice is not posted again.
    await db
      .update(conversation)
      .set({ handoffTimeoutNotifiedAt: now })
      .where(eq(conversation.id, conversationId));
  }

  if (updated.length === 0) {
    const current = await db.query.conversation.findFirst({
      where: eq(conversation.id, conversationId),
      columns: { escalationStatus: true, followUpEmail: true },
    });
    const status = current?.escalationStatus === "active" ? "active" : current?.escalationStatus === "pending" ? "pending" : null;
    return {
      escalated: false,
      escalationStatus: status,
      availability,
      needsEmail: status === "pending" && availability === "offline" && !(current?.followUpEmail ?? customerEmail),
    };
  }

  const followUpEmail = updated[0].followUpEmail ?? customerEmail;
  const needsEmail = availability === "offline" && !followUpEmail;

  await postSystemMessage({ orgId, productId, conversationId, body: handoffNotice(availability, followUpEmail) });

  const assignee = availability === "online" ? await autoAssign(orgId, productId, conversationId) : null;
  if (assignee) {
    await postSystemMessage({ orgId, productId, conversationId, body: `${assignee.name} joined the conversation.` });
    await Promise.allSettled([
      publishToConversation(orgId, productId, conversationId, "escalation_update", {
        status: "active",
        agentName: assignee.name,
      }),
      publishToProductInbox(orgId, productId, "conversation_assigned", {
        conversationId,
        assigneeId: assignee.id,
        subject,
        customerName,
      }),
      publishToProductInbox(orgId, productId, "conversation_updated", {
        conversationId,
        status: "open",
        escalationStatus: "active",
        handoffReason: reason,
        assigneeId: assignee.id,
        aiHandled: false,
        escalatedAt: now.toISOString(),
      }),
      enqueueAndKick(HANDOFF_JOB_TYPES.summarize, { conversationId }, {
        dedupeKey: `${HANDOFF_JOB_TYPES.summarize}:${conversationId}`,
        maxAttempts: 2,
      }),
    ]);
    return { escalated: true, escalationStatus: "active", availability, needsEmail: false };
  }

  await Promise.allSettled([
    publishToConversation(orgId, productId, conversationId, "escalation_update", {
      status: "pending",
      availability,
      needsEmail,
    }),
    publishToProductInbox(orgId, productId, "needs_agent", {
      conversationId,
      subject,
      customerName,
      escalatedAt: now.toISOString(),
      reason: HANDOFF_REASON_LABELS[reason] ?? reason,
    }),
    publishToProductInbox(orgId, productId, "conversation_updated", {
      conversationId,
      status: "open",
      escalationStatus: "pending",
      handoffReason: reason,
      assigneeId: null,
      aiHandled: false,
      escalatedAt: now.toISOString(),
    }),
  ]);

  await Promise.allSettled([
    enqueueAndKick(HANDOFF_JOB_TYPES.summarize, { conversationId }, {
      dedupeKey: `${HANDOFF_JOB_TYPES.summarize}:${conversationId}`,
      maxAttempts: 2,
    }),
    // Email agents when nobody is watching the inbox in real time.
    availability !== "online"
      ? enqueueAndKick(HANDOFF_JOB_TYPES.notifyAgents, { conversationId }, {
          dedupeKey: `${HANDOFF_JOB_TYPES.notifyAgents}:${conversationId}`,
          maxAttempts: 3,
        })
      : Promise.resolve(""),
  ]);

  return { escalated: true, escalationStatus: "pending", availability, needsEmail };
}

/**
 * Lazily posts the "we'll follow up by email" notice once a pending handoff
 * has waited longer than the product's timeout. Called from widget polling and
 * chat requests, so no scheduler is needed.
 */
export async function maybeNotifyHandoffTimeout({
  orgId,
  productId,
  conv,
  timeoutSec,
  customerEmail,
}: {
  orgId: string;
  productId: string;
  conv: {
    id: string;
    escalationStatus: string | null;
    assigneeId: string | null;
    escalatedAt: Date | null;
    handoffTimeoutNotifiedAt: Date | null;
    followUpEmail: string | null;
  };
  timeoutSec: number;
  customerEmail: string | null;
}): Promise<boolean> {
  if (conv.escalationStatus !== "pending" || conv.assigneeId || conv.handoffTimeoutNotifiedAt || !conv.escalatedAt) {
    return false;
  }
  if (Date.now() - conv.escalatedAt.getTime() < Math.max(30, timeoutSec) * 1000) return false;

  const claimed = await db
    .update(conversation)
    .set({ handoffTimeoutNotifiedAt: new Date() })
    .where(and(eq(conversation.id, conv.id), isNull(conversation.handoffTimeoutNotifiedAt)))
    .returning({ id: conversation.id });
  if (claimed.length === 0) return false;

  const email = conv.followUpEmail ?? customerEmail;
  await postSystemMessage({
    orgId,
    productId,
    conversationId: conv.id,
    body: email
      ? `Thanks for waiting. Our team is still busy — we'll reply to ${email} as soon as we can, so feel free to close this window.`
      : "Thanks for waiting. Our team is still busy — leave your email below and we'll follow up as soon as we can.",
  });
  await Promise.allSettled([
    publishToConversation(orgId, productId, conv.id, "escalation_update", {
      status: "pending",
      availability: "offline",
      needsEmail: !email,
    }),
    enqueueAndKick(HANDOFF_JOB_TYPES.notifyAgents, { conversationId: conv.id, reminder: true }, {
      dedupeKey: `${HANDOFF_JOB_TYPES.notifyAgents}:${conv.id}`,
      maxAttempts: 3,
    }),
  ]);
  return true;
}
