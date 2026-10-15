import { streamText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, message, product } from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import { decideHandoff } from "@/lib/handoff/policy";
import { escalateConversation, maybeNotifyHandoffTimeout, type EscalationResult } from "@/lib/handoff/service";
import { google, resolveGenerationModel } from "@/lib/knowledge/ai";
import { buildSupportSystemPrompt } from "@/lib/knowledge/prompt";
import { buildRetrievalQuery, isSmallTalk } from "@/lib/knowledge/rank";
import { citationsFor, retrieveKnowledge, type RetrievedChunk } from "@/lib/knowledge/retrieve";
import { createMissingKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import {
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import {
  createConversationPublicAccessToken,
  findWidgetConversation,
} from "@/lib/widget-conversation-access";
import { emitConversationEvent, emitWebhookEvent, messageData } from "@/lib/webhooks/service";
import { normalizeWidgetConfig } from "@/lib/widget-config";
import { widgetCorsHeaders } from "@/lib/widget-cors";
import { checkIdentity, normalizeIdentityMode } from "@/lib/widget-identity";
import { checkWidgetOrigin } from "@/lib/widget-origin";
import {
  normalizeWidgetCustomer,
  resolveWidgetCustomer,
  type WidgetCustomerInput,
} from "@/lib/widget-customer";

export const maxDuration = 60;

// Widget runs on customer domains. CORS is open unless the product configures
// an origin allow-list (see src/lib/widget-cors.ts).
// Cap widget messages to limit abuse and keep prompt size bounded.
const MAX_WIDGET_MESSAGE_LENGTH = 2000;

export function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: widgetCorsHeaders(req.headers.get("origin"), null) });
}

// Returns the widget configuration (bot name, theme, etc.) to the widget JS on load.
export async function GET(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null);
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400, headers: CORS });
  }

  const found = await db.query.product.findFirst({
    where: eq(product.id, productId),
    with: { widgetConfigs: true },
  });
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const originCheck = await checkWidgetOrigin(req.headers, productId);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

  return NextResponse.json(normalizeWidgetConfig(found.widgetConfigs[0]), { headers: CORS });
}

type ChatRequest = {
  productId: string;
  message: string;
  conversationId?: string;
  conversationToken?: string;
  customer: WidgetCustomerInput;
};

function quotaErrorResponse(error: unknown, cors: Headers) {
  if (!isSecurityQuotaError(error)) return null;
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json");
  if (error.retryAfter) {
    headers.set("Retry-After", String(error.retryAfter));
  }

  return NextResponse.json({ error: error.message }, { status: error.status, headers });
}

type HistoryRow = { senderType: string; body: string };

// Maps the transcript to model messages. Human agent replies are labelled so
// the model does not mistake them for its own words; system notices are skipped.
function toModelMessages(history: HistoryRow[]) {
  return history
    .filter((m) => m.senderType === "customer" || m.senderType === "ai" || m.senderType === "agent")
    .slice(-20)
    .map((m) => ({
      role: (m.senderType === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.senderType === "agent" ? `[Reply from a human support teammate]\n${m.body}` : m.body,
    }));
}

function handoffPromptNote(status: "pending" | "active" | null, availability: string | undefined): string | null {
  if (status !== "pending") return null;
  return availability === "offline"
    ? "The customer has been handed to the human support team, who are offline right now and will follow up by email. Keep helping with what you can; do not promise when someone will reply."
    : "The customer is waiting for a human support teammate to join this chat. Keep helping with what you can in the meantime; do not promise when someone will join.";
}

export async function POST(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null);
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const {
    productId,
    message: userMessage,
    conversationId,
    conversationToken,
    customer: customerInfo,
  } = body;
  const trimmedMessage = typeof userMessage === "string" ? userMessage.trim() : "";
  const normalizedCustomer = normalizeWidgetCustomer(customerInfo);

  if (!productId || !trimmedMessage || !normalizedCustomer) {
    return NextResponse.json(
      { error: "productId, message, and a valid customer.externalId/customer.id or customer.email are required" },
      { status: 400, headers: CORS },
    );
  }

  if (trimmedMessage.length > MAX_WIDGET_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Input is too long." }, { status: 400, headers: CORS });
  }

  // ── Product + widget config ──────────────────────────────────────────────
  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
    with: { widgetConfigs: true },
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const originCheck = await checkWidgetOrigin(req.headers, productId);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

  try {
    const event = {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/chat",
      method: "POST",
    };
    await requireSecurityQuota("chat.product.hour", productId, event);
    await requireSecurityQuota("chat.product.day", productId, event);
    await requireSecurityQuota("chat.customer.hour", `${productId}:${normalizedCustomer.identityKey}`, {
      ...event,
      metadata: { customerIdentity: safeQuotaKey(normalizedCustomer.identityKey) },
    });
    await requireSecurityQuota("chat.customer.day", `${productId}:${normalizedCustomer.identityKey}`, {
      ...event,
      metadata: { customerIdentity: safeQuotaKey(normalizedCustomer.identityKey) },
    });
  } catch (error) {
    const response = quotaErrorResponse(error, CORS);
    if (response) return response;
    throw error;
  }

  const widgetRow = foundProduct.widgetConfigs[0];
  const config = normalizeWidgetConfig(widgetRow);
  const botName = config.botName;
  const orgId = foundProduct.organizationId;

  // ── Identity verification ────────────────────────────────────────────────
  const identity = checkIdentity({
    mode: normalizeIdentityMode(widgetRow?.identityVerification),
    secret: widgetRow?.identitySecret,
    customer: normalizedCustomer,
    userHash: customerInfo?.userHash,
  });
  if (!identity.ok) {
    return NextResponse.json({ error: identity.error }, { status: 401, headers: CORS });
  }

  // ── Customer upsert ──────────────────────────────────────────────────────
  const now = new Date();
  let createdConversation = false;
  const resolvedCustomer = await resolveWidgetCustomer({
    organizationId: orgId,
    input: customerInfo,
    verified: identity.verified,
  });
  if (!resolvedCustomer) {
    return NextResponse.json(
      { error: "A valid customer.externalId/customer.id or customer.email is required" },
      { status: 400, headers: CORS },
    );
  }
  const cust = resolvedCustomer.customer;

  // ── Conversation get-or-create ───────────────────────────────────────────
  let conv = conversationId
    ? await findWidgetConversation({
        conversationId,
        productId,
        conversationToken,
        customerId: cust.id,
      })
    : null;

  if (conversationId && conversationToken && !conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  // Resuming without the conversation token is only allowed for verified
  // identities; otherwise anyone who knows a customer's email could read
  // their conversation.
  if (!conv && identity.verified) {
    conv = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.productId, productId),
        eq(conversation.customerId, cust.id),
        eq(conversation.status, "open"),
      ),
      orderBy: [desc(conversation.lastMessageAt)],
    });
  }

  if (!conv) {
    const convId = crypto.randomUUID();
    createdConversation = true;
    const [inserted] = await db
      .insert(conversation)
      .values({
        id: convId,
        productId,
        customerId: cust.id,
        status: "open",
        aiHandled: true,
        publicAccessToken: createConversationPublicAccessToken(),
        subject: trimmedMessage.slice(0, 80),
        identityVerified: identity.verified,
        customerLastSeenAt: now,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    conv = inserted;
  } else if (conv.status !== "open") {
    // Re-open resolved/snoozed conversations when the customer writes again.
    await db
      .update(conversation)
      .set({ status: "open", snoozedUntil: null, resolvedAt: null, updatedAt: now })
      .where(eq(conversation.id, conv.id));
    conv = { ...conv, status: "open", snoozedUntil: null, resolvedAt: null, updatedAt: now };
  }

  if (!conv) {
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
  const convId = conv.id;

  // Per-conversation flood control applies whether or not a human is involved.
  try {
    await requireSecurityQuota("chat.conversation.minute", convId, {
      organizationId: orgId,
      productId,
      headerList: req.headers,
      path: "/api/chat",
      method: "POST",
      metadata: { conversationId: convId },
    });
  } catch (error) {
    const response = quotaErrorResponse(error, CORS);
    if (response) return response;
    throw error;
  }

  // ── Save customer message ────────────────────────────────────────────────
  const customerMessageId = crypto.randomUUID();
  const [savedCustomerMessage] = await db
    .insert(message)
    .values({
      id: customerMessageId,
      conversationId: convId,
      body: trimmedMessage,
      senderType: "customer",
      senderId: null,
      createdAt: now,
    })
    .returning({ seq: message.seq });
  await db
    .update(conversation)
    .set({ lastMessageAt: now, customerLastSeenAt: now, updatedAt: now })
    .where(eq(conversation.id, convId));

  const customerMessageEvent = {
    id: customerMessageId,
    seq: savedCustomerMessage?.seq,
    body: trimmedMessage,
    senderType: "customer",
    createdAt: now.toISOString(),
  };
  publishToConversation(orgId, productId, convId, "message", customerMessageEvent).catch(() => {});
  if (createdConversation) {
    publishToProductInbox(orgId, productId, "new_conversation", { conversationId: convId }).catch(() => {});
  }
  publishToProductInbox(orgId, productId, "conversation_updated", {
    conversationId: convId,
    status: "open",
    escalationStatus: conv.escalationStatus,
    assigneeId: conv.assigneeId,
    aiHandled: conv.aiHandled,
    lastMessageAt: now.toISOString(),
    latestMessage: customerMessageEvent,
  }).catch(() => {});
  after(async () => {
    if (createdConversation) await emitConversationEvent("conversation.created", convId);
    await emitWebhookEvent(
      productId,
      "message.created",
      messageData({ id: customerMessageId, conversationId: convId, senderType: "customer", body: trimmedMessage, createdAt: now }),
    );
  });

  const baseHeaders = new Headers(CORS);
  baseHeaders.set("x-conversation-id", convId);
  baseHeaders.set("x-conversation-token", conv.publicAccessToken);
  baseHeaders.set("x-message-id", customerMessageId);

  // ── A human agent is handling this conversation: no AI reply ─────────────
  if (conv.escalationStatus === "active") {
    baseHeaders.set("x-escalation-status", "active");
    baseHeaders.set("x-reply-mode", "none");
    return new Response("Your message was sent to the support team.", { status: 200, headers: baseHeaders });
  }

  if (conv.escalationStatus === "pending") {
    await maybeNotifyHandoffTimeout({
      orgId,
      productId,
      conv,
      timeoutSec: widgetRow?.handoffTimeoutSec ?? 300,
      customerEmail: cust.email,
    }).catch((error) => console.error("[chat] handoff timeout check failed", error));
  }

  // ── Conversation history ─────────────────────────────────────────────────
  const recent = await db.query.message.findMany({
    where: eq(message.conversationId, convId),
    orderBy: (m, { desc: d }) => [d(m.seq)],
    limit: 40,
  });
  const history = recent.reverse();
  const previousCustomerMessages = history
    .filter((m) => m.senderType === "customer" && m.id !== customerMessageId)
    .map((m) => m.body)
    .slice(-3);

  // ── Knowledge retrieval (hybrid vector + keyword search) ────────────────
  const smallTalk = isSmallTalk(trimmedMessage);
  let retrievedChunks: RetrievedChunk[] = [];
  let retrievalFailed = false;

  if (!smallTalk) {
    try {
      const retrieval = await retrieveKnowledge({
        productId,
        query: buildRetrievalQuery(trimmedMessage, previousCustomerMessages),
      });
      retrievedChunks = retrieval.chunks;
    } catch (error) {
      retrievalFailed = true;
      console.error("[chat] knowledge retrieval failed", error);
    }
  }

  const foundRelevantKnowledge = retrievedChunks.length > 0;
  const citations = citationsFor(retrievedChunks);

  if (!foundRelevantKnowledge && !smallTalk && !retrievalFailed) {
    createMissingKnowledgeSuggestion({
      productId,
      question: trimmedMessage,
      sourceConversationId: convId,
      reason: "A customer asked this in the widget, but no indexed knowledge matched it.",
    }).catch(() => {});
  }

  // ── Handoff decision (before streaming so the widget learns immediately) ─
  let escalation: EscalationResult | null = null;
  let escalationStatus = conv.escalationStatus as "pending" | "active" | null;

  if (escalationStatus === null) {
    const decision = decideHandoff({
      message: trimmedMessage,
      previousCustomerMessages,
      unansweredStreak: conv.unansweredStreak,
      // A retrieval outage is not the customer's problem; don't count it.
      foundKnowledge: foundRelevantKnowledge || retrievalFailed,
      smallTalk,
    });
    if (decision.nextUnansweredStreak !== conv.unansweredStreak) {
      await db
        .update(conversation)
        .set({ unansweredStreak: decision.nextUnansweredStreak })
        .where(eq(conversation.id, convId));
    }
    if (decision.escalate && decision.reason) {
      escalation = await escalateConversation({
        orgId,
        productId,
        conversationId: convId,
        reason: decision.reason,
        subject: conv.subject,
        customerName: cust.name,
        customerEmail: cust.email,
      });
      escalationStatus = escalation.escalationStatus;
    }
  }

  if (escalationStatus) baseHeaders.set("x-escalation-status", escalationStatus);
  if (escalation) {
    baseHeaders.set("x-handoff-availability", escalation.availability);
    if (escalation.needsEmail) baseHeaders.set("x-needs-email", "1");
  }

  // Just handed off and the knowledge base has nothing to add: the handoff
  // notice (a system message) is the reply, so skip the AI answer.
  if (escalation?.escalated && !foundRelevantKnowledge) {
    baseHeaders.set("x-reply-mode", "none");
    return new Response("Connecting you with our support team.", { status: 200, headers: baseHeaders });
  }

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = [
    buildSupportSystemPrompt({
      botName,
      productName: foundProduct.name,
      productDescription: foundProduct.description,
      chunks: retrievedChunks,
    }),
    handoffPromptNote(escalationStatus, escalation?.availability),
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── Stream generation ────────────────────────────────────────────────────
  const modelId = await resolveGenerationModel();
  const aiMessageId = crypto.randomUUID();

  const result = streamText({
    model: google(modelId),
    system: systemPrompt,
    messages: toModelMessages(history),
    onFinish: async ({ text }) => {
      if (!text.trim()) return;
      const finishAt = new Date();
      const [saved] = await db
        .insert(message)
        .values({
          id: aiMessageId,
          conversationId: convId,
          body: text,
          senderType: "ai",
          senderId: null,
          sources: citations.length > 0 ? citations : null,
          createdAt: finishAt,
        })
        .returning({ seq: message.seq });
      // Only timestamps here: escalation state may have changed while
      // streaming (customer pressed the button, an agent joined).
      await db
        .update(conversation)
        .set({ lastMessageAt: finishAt, updatedAt: finishAt })
        .where(eq(conversation.id, convId));

      const aiMessageEvent = {
        id: aiMessageId,
        seq: saved?.seq,
        body: text,
        senderType: "ai",
        sources: citations,
        createdAt: finishAt.toISOString(),
      };
      publishToConversation(orgId, productId, convId, "message", aiMessageEvent).catch(() => {});
      publishToProductInbox(orgId, productId, "conversation_updated", {
        conversationId: convId,
        lastMessageAt: finishAt.toISOString(),
        latestMessage: aiMessageEvent,
      }).catch(() => {});
      await emitWebhookEvent(
        productId,
        "message.created",
        messageData({ id: aiMessageId, conversationId: convId, senderType: "ai", body: text, createdAt: finishAt }),
      );
    },
  });

  // ── Response ─────────────────────────────────────────────────────────────
  // Plain text stream — easy for the widget to consume with a ReadableStream.
  const streamResponse = result.toTextStreamResponse();
  const headers = new Headers(streamResponse.headers);
  baseHeaders.forEach((value, key) => headers.set(key, value));
  headers.set("x-ai-message-id", aiMessageId);
  // Citations for the answer. Base64-encoded JSON: header values must be
  // Latin-1, and page titles often are not (setting them raw throws).
  if (citations.length > 0) {
    headers.set("x-sources", Buffer.from(JSON.stringify(citations), "utf8").toString("base64"));
  }

  return new Response(streamResponse.body, { status: 200, headers });
}
