"use server";

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";

import { db } from "@/db";
import {
  conversation,
  customer,
  knowledgeSuggestion,
  member,
  message,
  productMember,
  user,
} from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import { postSystemMessage, HANDOFF_JOB_TYPES } from "@/lib/handoff/service";
import { enqueueAndKick } from "@/lib/jobs/queue";
import { geminiGenerate } from "@/lib/knowledge/ai";
import {
  canAccessProductCapability,
  isProductRole,
  requireProductAccess,
  type ProductAccess,
} from "@/lib/product-access";
import { requireSecurityQuota } from "@/lib/security";

import type { ConversationWithDetails, InboxMessage } from "./types";

type ConversationRow = typeof conversation.$inferSelect;
type SuggestionResult = "created" | "existing";
type ExtractedSuggestion = {
  question: string;
  answer: string;
  reason?: string;
  confidence?: number;
};

const MAX_REPLY_LENGTH = 5000;

async function verifyConversationAccess(conversationId: string) {
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
  });
  if (!conv) throw new Error("Not found");

  const access = await requireProductAccess(conv.productId, ["inbox"]);
  return { ...access, conv };
}

function isManager(access: ProductAccess) {
  return access.role !== "agent";
}

// Agents work only on conversations assigned to them; admins and developers
// can work on any conversation in the product.
function assertCanUseConversation(access: ProductAccess, conv: ConversationRow) {
  if (isManager(access)) return;
  if (conv.assigneeId !== access.session.user.id) {
    throw new Error("Claim this conversation before viewing or replying");
  }
}

function orgOf(access: ProductAccess) {
  return access.membership.organizationId;
}

async function publishLifecycle(
  access: ProductAccess,
  conv: Pick<ConversationRow, "id" | "productId">,
  update: Partial<Record<string, unknown>>,
  widgetEscalation?: { status: "pending" | "active" | null; agentName?: string | null; resolved?: boolean },
) {
  const orgId = orgOf(access);
  await Promise.allSettled([
    publishToProductInbox(orgId, conv.productId, "conversation_updated", { conversationId: conv.id, ...update }),
    widgetEscalation
      ? publishToConversation(orgId, conv.productId, conv.id, "escalation_update", widgetEscalation)
      : Promise.resolve(),
  ]);
}

function systemMessage(access: ProductAccess, conv: Pick<ConversationRow, "id" | "productId">, body: string) {
  return postSystemMessage({
    orgId: orgOf(access),
    productId: conv.productId,
    conversationId: conv.id,
    body,
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getMessages(conversationId: string): Promise<InboxMessage[]> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);

  const rows = await db
    .select({
      id: message.id,
      conversationId: message.conversationId,
      body: message.body,
      senderType: message.senderType,
      senderId: message.senderId,
      senderName: user.name,
      sources: message.sources,
      createdAt: message.createdAt,
    })
    .from(message)
    .leftJoin(user, eq(user.id, message.senderId))
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.seq));
  return rows;
}

/** Single conversation in inbox shape, used when realtime announces one the list doesn't have. */
export async function getConversationForInbox(conversationId: string): Promise<ConversationWithDetails | null> {
  let result;
  try {
    result = await verifyConversationAccess(conversationId);
  } catch {
    return null;
  }
  const { conv, ...access } = result;
  if (
    !isManager(access) &&
    conv.assigneeId !== access.session.user.id &&
    !(conv.escalationStatus === "pending" && !conv.assigneeId)
  ) {
    return null;
  }

  const [cust, latest] = await Promise.all([
    db.query.customer.findFirst({
      where: eq(customer.id, conv.customerId),
      columns: { id: true, name: true, email: true },
    }),
    db.query.message.findFirst({
      where: eq(message.conversationId, conv.id),
      orderBy: (m, { desc }) => [desc(m.seq)],
      columns: { id: true, body: true, senderType: true, createdAt: true },
    }),
  ]);
  if (!cust) return null;
  return { ...conv, customer: cust, latestMessage: latest ?? null };
}

export type Teammate = { id: string; name: string; role: string };

/** People who can be assigned conversations in this product. */
export async function listTeammates(productId: string): Promise<Teammate[]> {
  const access = await requireProductAccess(productId, ["inbox"]);
  const assigned = await db
    .select({ id: user.id, name: user.name, role: productMember.role })
    .from(productMember)
    .innerJoin(user, eq(user.id, productMember.userId))
    .where(eq(productMember.productId, productId));
  const workspaceAdmins = await db
    .select({ id: user.id, name: user.name, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, access.product.organizationId),
        or(eq(member.role, "owner"), eq(member.role, "admin")),
      ),
    );

  const byId = new Map<string, Teammate>();
  for (const row of [...workspaceAdmins, ...assigned]) {
    byId.set(row.id, { id: row.id, name: row.name, role: row.role === "owner" ? "admin" : row.role });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function canUserWorkInbox(productId: string, organizationId: string, userId: string): Promise<boolean> {
  const orgMembership = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
  });
  if (!orgMembership) return false;
  if (orgMembership.role === "owner") return true;
  const assigned = await db.query.productMember.findFirst({
    where: and(eq(productMember.productId, productId), eq(productMember.userId, userId)),
  });
  if (isProductRole(assigned?.role)) return canAccessProductCapability(assigned.role, "inbox");
  return orgMembership.role === "admin";
}

// ── Assignment ──────────────────────────────────────────────────────────────

/** Atomically claims an unassigned conversation (two agents can never both win). */
export async function claimConversation(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  if (!isManager(access) && conv.escalationStatus !== "pending") {
    throw new Error("Only conversations waiting for an agent can be claimed");
  }

  const now = new Date();
  const claimed = await db
    .update(conversation)
    .set({
      status: "open",
      escalationStatus: "active",
      escalatedAt: conv.escalatedAt ?? now,
      handoffReason: conv.handoffReason ?? "agent",
      aiHandled: false,
      assigneeId: access.session.user.id,
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(and(eq(conversation.id, conversationId), isNull(conversation.assigneeId)))
    .returning({ id: conversation.id });

  if (claimed.length === 0) throw new Error("Someone else already claimed this conversation");

  const name = access.session.user.name;
  await systemMessage(access, conv, `${name} joined the conversation.`);
  await publishLifecycle(
    access,
    conv,
    { status: "open", escalationStatus: "active", assigneeId: access.session.user.id, aiHandled: false },
    { status: "active", agentName: name },
  );
}

/** Kept for older clients. */
export async function joinConversation(conversationId: string): Promise<void> {
  return claimConversation(conversationId);
}

/** Admins/developers can take over a conversation assigned to someone else. */
export async function takeOverConversation(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  if (!isManager(access)) throw new Error("Only admins can take over conversations");
  if (conv.assigneeId === access.session.user.id) return;

  const now = new Date();
  await db
    .update(conversation)
    .set({
      status: "open",
      escalationStatus: "active",
      escalatedAt: conv.escalatedAt ?? now,
      handoffReason: conv.handoffReason ?? "agent",
      aiHandled: false,
      assigneeId: access.session.user.id,
      updatedAt: now,
    })
    .where(eq(conversation.id, conversationId));

  const name = access.session.user.name;
  await systemMessage(access, conv, `${name} joined the conversation.`);
  await publishLifecycle(
    access,
    conv,
    { status: "open", escalationStatus: "active", assigneeId: access.session.user.id, aiHandled: false },
    { status: "active", agentName: name },
  );
}

/** Transfers to a teammate, or returns the conversation to the queue (assigneeId = null). */
export async function assignConversation(conversationId: string, assigneeId: string | null): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  if (!isManager(access) && conv.assigneeId !== access.session.user.id) {
    throw new Error("You can only transfer conversations assigned to you");
  }

  const now = new Date();
  if (assigneeId === null) {
    await db
      .update(conversation)
      .set({ assigneeId: null, escalationStatus: "pending", aiHandled: false, updatedAt: now })
      .where(eq(conversation.id, conversationId));
    await systemMessage(access, conv, "Your conversation is back in the queue. The next available teammate will join.");
    await publishLifecycle(
      access,
      conv,
      { escalationStatus: "pending", assigneeId: null, aiHandled: false },
      { status: "pending" },
    );
    return;
  }

  if (!(await canUserWorkInbox(conv.productId, orgOf(access), assigneeId))) {
    throw new Error("That teammate doesn't have access to this inbox");
  }
  const target = await db.query.user.findFirst({ where: eq(user.id, assigneeId), columns: { name: true } });

  await db
    .update(conversation)
    .set({
      status: "open",
      assigneeId,
      escalationStatus: "active",
      escalatedAt: conv.escalatedAt ?? now,
      handoffReason: conv.handoffReason ?? "agent",
      aiHandled: false,
      updatedAt: now,
    })
    .where(eq(conversation.id, conversationId));

  await systemMessage(access, conv, `${target?.name ?? "A teammate"} joined the conversation.`);
  await publishLifecycle(
    access,
    conv,
    { status: "open", escalationStatus: "active", assigneeId, aiHandled: false },
    { status: "active", agentName: target?.name ?? null },
  );
}

/** Ends the human handoff; the AI assistant answers again. */
export async function handBackToAI(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);

  await db
    .update(conversation)
    .set({
      escalationStatus: null,
      aiHandled: true,
      assigneeId: null,
      unansweredStreak: 0,
      handoffTimeoutNotifiedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(conversation.id, conversationId));

  await systemMessage(access, conv, "You're chatting with our AI assistant again. Ask for a person any time.");
  await publishLifecycle(
    access,
    conv,
    { escalationStatus: null, assigneeId: null, aiHandled: true },
    { status: null },
  );
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function resolveConversation(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);
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
      resolvedById: access.session.user.id,
      updatedAt: now,
    })
    .where(eq(conversation.id, conversationId));

  await systemMessage(access, conv, "This conversation was marked as resolved. Send a message any time to reopen it.");
  await publishLifecycle(
    access,
    conv,
    { status: "resolved", escalationStatus: null, assigneeId: null, aiHandled: true },
    { status: null, resolved: true },
  );

  if (access.role !== "agent") {
    after(() =>
      createKnowledgeSuggestionFromConversation(conversationId).catch(() => {
        // Conversation resolution must not be blocked by AI extraction failures.
      }),
    );
  }
}

const SNOOZE_DURATIONS_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export async function snoozeConversation(conversationId: string, duration: string = "4h"): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);
  const now = new Date();
  const snoozedUntil = new Date(now.getTime() + (SNOOZE_DURATIONS_MS[duration] ?? SNOOZE_DURATIONS_MS["4h"]));
  // Escalation and assignment are kept: snoozing hides the conversation from
  // the open queue until it wakes up or the customer writes again.
  await db
    .update(conversation)
    .set({ status: "snoozed", snoozedUntil, updatedAt: now })
    .where(eq(conversation.id, conversationId));

  await publishLifecycle(access, conv, { status: "snoozed", snoozedUntil: snoozedUntil.toISOString() });
}

export async function reopenConversation(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);
  await db
    .update(conversation)
    .set({ status: "open", snoozedUntil: null, resolvedAt: null, updatedAt: new Date() })
    .where(eq(conversation.id, conversationId));

  await publishLifecycle(access, conv, { status: "open" });
}

// ── Messaging ───────────────────────────────────────────────────────────────

export async function sendMessage(conversationId: string, rawBody: string): Promise<InboxMessage> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);

  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) throw new Error("Message cannot be empty");
  if (body.length > MAX_REPLY_LENGTH) throw new Error(`Replies are limited to ${MAX_REPLY_LENGTH} characters`);

  const userId = access.session.user.id;
  const userName = access.session.user.name;
  const headerList = await headers();
  await requireSecurityQuota("inbox.agent.user.hour", userId, {
    userId,
    organizationId: orgOf(access),
    productId: conv.productId,
    headerList,
    path: "/inbox/send-message",
    method: "POST",
  });

  // Replying to an unassigned conversation claims it. Replying to a
  // conversation assigned to someone else (admins only) keeps the assignee.
  const claiming = !conv.assigneeId;
  const now = new Date();
  if (claiming) {
    const claimed = await db
      .update(conversation)
      .set({
        status: "open",
        escalationStatus: "active",
        escalatedAt: conv.escalatedAt ?? now,
        handoffReason: conv.handoffReason ?? "agent",
        aiHandled: false,
        assigneeId: userId,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(and(eq(conversation.id, conversationId), isNull(conversation.assigneeId)))
      .returning({ id: conversation.id });
    if (claimed.length > 0) {
      await systemMessage(access, conv, `${userName} joined the conversation.`);
    } else if (!isManager(access)) {
      throw new Error("Someone else already claimed this conversation");
    }
  }

  const id = crypto.randomUUID();
  const [saved] = await db
    .insert(message)
    .values({ id, conversationId, body, senderType: "agent", senderId: userId, createdAt: new Date() })
    .returning({ seq: message.seq, createdAt: message.createdAt });

  await db
    .update(conversation)
    .set({ status: "open", snoozedUntil: null, lastMessageAt: saved.createdAt, updatedAt: saved.createdAt })
    .where(eq(conversation.id, conversationId));

  const event = {
    id,
    seq: saved.seq,
    body,
    senderType: "agent",
    senderName: userName,
    createdAt: saved.createdAt.toISOString(),
  };
  const orgId = orgOf(access);
  await Promise.allSettled([
    publishToConversation(orgId, conv.productId, conversationId, "message", event),
    claiming
      ? publishToConversation(orgId, conv.productId, conversationId, "escalation_update", {
          status: "active",
          agentName: userName,
        })
      : Promise.resolve(),
    publishToProductInbox(orgId, conv.productId, "conversation_updated", {
      conversationId,
      status: "open",
      escalationStatus: "active",
      assigneeId: conv.assigneeId ?? userId,
      aiHandled: false,
      lastMessageAt: event.createdAt,
      latestMessage: event,
    }),
  ]);

  // Email the reply if the customer has left the widget.
  const lastSeen = conv.customerLastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > 2 * 60 * 1000) {
    after(() =>
      enqueueAndKick(HANDOFF_JOB_TYPES.notifyCustomer, { conversationId }, {
        dedupeKey: `${HANDOFF_JOB_TYPES.notifyCustomer}:${conversationId}`,
        maxAttempts: 3,
      }).catch(() => {}),
    );
  }

  return {
    id,
    conversationId,
    body,
    senderType: "agent",
    senderId: userId,
    senderName: userName,
    sources: null,
    createdAt: saved.createdAt,
  };
}

/** Lets the customer see "<agent> is typing…". Throttled by the client. */
export async function sendTypingIndicator(conversationId: string): Promise<void> {
  const { conv, ...access } = await verifyConversationAccess(conversationId);
  assertCanUseConversation(access, conv);
  await publishToConversation(orgOf(access), conv.productId, conversationId, "typing", {
    agentName: access.session.user.name,
  }).catch(() => {});
}

// ── Knowledge learning ──────────────────────────────────────────────────────

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
  await requireProductAccess(conv.productId, ["knowledge"]);

  const existing = await db.query.knowledgeSuggestion.findFirst({
    where: eq(knowledgeSuggestion.sourceConversationId, conversationId),
  });
  if (existing) return "existing";

  const messages = await db.query.message.findMany({
    where: and(
      eq(message.conversationId, conversationId),
      inArray(message.senderType, ["customer", "ai", "agent"]),
    ),
    orderBy: [asc(message.seq)],
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
