import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  conversation,
  message,
  product,
} from "@/db/schema";
import { env } from "@/lib/env";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import { geminiEmbed, resolveGenerationModel } from "@/lib/knowledge/ai";
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
import { normalizeWidgetConfig } from "@/lib/widget-config";
import {
  normalizeWidgetCustomer,
  resolveWidgetCustomer,
  type WidgetCustomerInput,
} from "@/lib/widget-customer";

export const maxDuration = 60;

// Widget runs on any customer domain — CORS must be fully open.
const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "x-conversation-id, x-conversation-token, x-sources, x-escalation-status",
};
// Cap widget messages to limit abuse and keep prompt size bounded.
const MAX_WIDGET_MESSAGE_LENGTH = 2000;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Returns the widget configuration (bot name, theme, etc.) to the widget JS on load.
export async function GET(req: NextRequest) {
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

  return NextResponse.json(normalizeWidgetConfig(found.widgetConfigs[0]), { headers: CORS });
}

type ChatRequest = {
  productId: string;
  message: string;
  conversationId?: string;
  conversationToken?: string;
  customer: WidgetCustomerInput;
};

function quotaErrorResponse(error: unknown) {
  if (!isSecurityQuotaError(error)) return null;
  const headers = new Headers(CORS);
  headers.set("Content-Type", "application/json");
  if (error.retryAfter) {
    headers.set("Retry-After", String(error.retryAfter));
  }

  return NextResponse.json({ error: error.message }, { status: error.status, headers });
}

function shouldNotifyAgent(text: string, hasRelevantKnowledge: boolean): boolean {
  if (!hasRelevantKnowledge) return true;

  const lower = text.toLowerCase();
  return (
    lower.includes("human agent") ||
    lower.includes("live agent") ||
    lower.includes("support agent") ||
    lower.includes("connect you") ||
    lower.includes("speak to")
  );
}

export async function POST(req: NextRequest) {
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
  const trimmedMessage = userMessage?.trim() ?? "";
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
    const response = quotaErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const config = normalizeWidgetConfig(foundProduct.widgetConfigs[0]);
  const botName = config.botName;

  // ── Customer upsert ──────────────────────────────────────────────────────
  const now = new Date();
  let createdConversation = false;
  const resolvedCustomer = await resolveWidgetCustomer({
    organizationId: foundProduct.organizationId,
    input: customerInfo,
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

  if (!conv) {
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
    const publicAccessToken = createConversationPublicAccessToken();
    await db.insert(conversation).values({
      id: convId,
      productId,
      customerId: cust.id,
      status: "open",
      aiHandled: true,
      publicAccessToken,
      subject: trimmedMessage.slice(0, 80),
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    conv = {
      id: convId,
      productId,
      customerId: cust.id,
      status: "open",
      assigneeId: null,
      aiHandled: true,
      escalationStatus: null,
      escalatedAt: null,
      publicAccessToken,
      subject: trimmedMessage.slice(0, 80),
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
  } else if (conv.status !== "open") {
    // Re-open resolved/snoozed conversations when the customer sends again
    await db
      .update(conversation)
      .set({ status: "open", updatedAt: now })
      .where(eq(conversation.id, conv.id));
    conv = { ...conv, status: "open", updatedAt: now };
  }

  // Narrow type — conv is always defined after get-or-create above.
  if (!conv) {
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  const orgId = foundProduct.organizationId;

  // ── Escalation gate — human agent has taken over, skip AI entirely ───────
  if (conv.escalationStatus === "pending" || conv.escalationStatus === "active") {
    const customerMessageId = crypto.randomUUID();
    await db.insert(message).values({
      id: customerMessageId,
      conversationId: conv.id,
      body: trimmedMessage,
      senderType: "customer",
      senderId: null,
      createdAt: now,
    });
    await db
      .update(conversation)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversation.id, conv.id));
    publishToConversation(orgId, conv.id, "message", {
      id: customerMessageId,
      body: trimmedMessage,
      senderType: "customer",
      createdAt: now.toISOString(),
    }).catch(() => {});
    publishToProductInbox(orgId, productId, "conversation_updated", {
      conversationId: conv.id,
      status: conv.status,
      escalationStatus: conv.escalationStatus,
      assigneeId: conv.assigneeId,
      aiHandled: conv.aiHandled,
      lastMessageAt: now.toISOString(),
      latestMessage: {
        id: customerMessageId,
        body: trimmedMessage,
        senderType: "customer",
        createdAt: now.toISOString(),
      },
    }).catch(() => {});

    const escHeaders = new Headers(CORS);
    escHeaders.set("x-conversation-id", conv.id);
    escHeaders.set("x-conversation-token", conv.publicAccessToken);
    escHeaders.set("x-escalation-status", conv.escalationStatus);
    const waitMsg =
      conv.escalationStatus === "pending"
        ? "Our team has been notified. An agent will be with you shortly."
        : "You're connected with an agent.";
    return new Response(waitMsg, { status: 200, headers: escHeaders });
  }

  // ── Save customer message ────────────────────────────────────────────────
  try {
    await requireSecurityQuota("chat.conversation.minute", conv.id, {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/chat",
      method: "POST",
      metadata: { conversationId: conv.id },
    });
  } catch (error) {
    const response = quotaErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const customerMessageId = crypto.randomUUID();
  await db.insert(message).values({
    id: customerMessageId,
    conversationId: conv.id,
    body: trimmedMessage,
    senderType: "customer",
    senderId: null,
    createdAt: now,
  });
  await db
    .update(conversation)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversation.id, conv.id));
  publishToConversation(orgId, conv.id, "message", {
    id: customerMessageId,
    body: trimmedMessage,
    senderType: "customer",
    createdAt: now.toISOString(),
  }).catch(() => {});
  if (createdConversation) {
    publishToProductInbox(orgId, productId, "new_conversation", {
      conversationId: conv.id,
    }).catch(() => {});
  }
  publishToProductInbox(orgId, productId, "conversation_updated", {
    conversationId: conv.id,
    status: conv.status,
    escalationStatus: conv.escalationStatus,
    assigneeId: conv.assigneeId,
    aiHandled: conv.aiHandled,
    lastMessageAt: now.toISOString(),
    latestMessage: {
      id: customerMessageId,
      body: trimmedMessage,
      senderType: "customer",
      createdAt: now.toISOString(),
    },
  }).catch(() => {});

  // ── Conversation history (last 20 turns for multi-turn context) ──────────
  const history = await db.query.message.findMany({
    where: eq(message.conversationId, conv.id),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const chatMessages = history
    .filter((m) => m.senderType === "customer" || m.senderType === "ai" || m.senderType === "agent")
    .slice(-20)
    .map((m) => ({
      role: (m.senderType === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));

  // ── RAG: semantic search over knowledge base ─────────────────────────────
  type SourceRow = { content: string; source_name: string; source_url: string | null };
  const sources: { name: string; url: string | null }[] = [];
  let ragContext = "";
  let foundRelevantKnowledge = false;

  try {
    const queryEmbedding = await geminiEmbed(trimmedMessage, productId);
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const results = await db.execute(
      sql`SELECT kc.content, ks.name AS source_name, ks.url AS source_url,
                 1 - (kc.embedding <=> ${vectorStr}::vector) AS similarity
          FROM knowledge_chunk kc
          JOIN knowledge_source ks ON ks.id = kc.source_id
          WHERE kc.product_id = ${productId}
            AND ks.status = 'indexed'
            AND 1 - (kc.embedding <=> ${vectorStr}::vector) >= 0.4
          ORDER BY kc.embedding <=> ${vectorStr}::vector
          LIMIT 5`,
    );

    const chunks = results.rows as (SourceRow & { similarity: number })[];
    if (chunks.length > 0) {
      foundRelevantKnowledge = true;
      ragContext = chunks
        .map((c, i) => `[${i + 1}] ${c.source_name}\n${c.content}`)
        .join("\n\n---\n\n");
      for (const c of chunks) {
        if (!sources.some((s) => s.name === c.source_name)) {
          sources.push({ name: c.source_name, url: c.source_url });
        }
      }
    }
  } catch {
    // KB not set up yet — proceed without context
  }

  if (!foundRelevantKnowledge) {
    createMissingKnowledgeSuggestion({
      productId,
      question: trimmedMessage,
      sourceConversationId: conv.id,
      reason:
        "A customer asked this in the widget, but no indexed knowledge matched above the retrieval threshold.",
    }).catch(() => {});
  }

  // ── System prompt ────────────────────────────────────────────────────────
  const systemLines = [
    `You are ${botName}, a helpful and friendly customer support assistant for ${foundProduct.name}.`,
    foundProduct.description ? `About this product: ${foundProduct.description}` : null,
    ragContext
      ? `Use the following knowledge base to answer accurately. Cite sources as [1], [2], etc. when relevant:\n\n${ragContext}\n\nIf the question is not covered by the knowledge base, acknowledge it and offer to connect the customer with a human agent.`
      : "Answer as helpfully as you can based on context. If you are not confident, offer to connect the customer with a human agent.",
    "Keep responses concise, clear, and friendly. Never make up information you are not sure about.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── Stream generation ────────────────────────────────────────────────────
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GEMINI_API_KEY });
  const modelId = await resolveGenerationModel();

  const convId = conv.id;
  const handoffCustomerName = cust.name;
  const conversationSubject = conv.subject;
  const result = streamText({
    model: google(modelId),
    system: systemLines,
    messages: chatMessages,
    onFinish: async ({ text }) => {
      const finishAt = new Date();
      const newMsgId = crypto.randomUUID();
      const notifyAgent = shouldNotifyAgent(text, foundRelevantKnowledge);
      const nextEscalationStatus = notifyAgent ? "pending" : null;
      const nextAiHandled = !notifyAgent;
      await db.insert(message).values({
        id: newMsgId,
        conversationId: convId,
        body: text,
        senderType: "ai",
        senderId: null,
        createdAt: finishAt,
      });
      await db
        .update(conversation)
        .set({
          lastMessageAt: finishAt,
          updatedAt: finishAt,
          aiHandled: nextAiHandled,
          escalationStatus: nextEscalationStatus,
          escalatedAt: notifyAgent ? finishAt : null,
          assigneeId: notifyAgent ? null : conv.assigneeId,
        })
        .where(eq(conversation.id, convId));
      // Push AI reply to any agent viewing this conversation in real-time.
      publishToConversation(orgId, convId, "message", {
        id: newMsgId,
        body: text,
        senderType: "ai",
        createdAt: finishAt.toISOString(),
      }).catch(() => {});
      publishToProductInbox(orgId, productId, "conversation_updated", {
        conversationId: convId,
        status: "open",
        escalationStatus: nextEscalationStatus,
        assigneeId: notifyAgent ? null : conv.assigneeId,
        aiHandled: nextAiHandled,
        lastMessageAt: finishAt.toISOString(),
        latestMessage: {
          id: newMsgId,
          body: text,
          senderType: "ai",
          createdAt: finishAt.toISOString(),
        },
      }).catch(() => {});
      if (notifyAgent) {
        publishToConversation(orgId, convId, "escalation_update", {
          status: "pending",
        }).catch(() => {});
        publishToProductInbox(orgId, productId, "needs_agent", {
          conversationId: convId,
          subject: conversationSubject,
          customerName: handoffCustomerName,
          escalatedAt: finishAt.toISOString(),
          reason: foundRelevantKnowledge
            ? "The AI response offered human handoff."
            : "No relevant knowledge matched the customer question.",
        }).catch(() => {});
      }
    },
  });

  // ── Response ─────────────────────────────────────────────────────────────
  // toTextStreamResponse() returns a plain text/plain stream — easy for the
  // widget to consume with a ReadableStream reader.
  const streamResponse = result.toTextStreamResponse();
  const headers = new Headers(streamResponse.headers);

  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  // Widget reads x-conversation-id on the first response and stores it for subsequent turns.
  headers.set("x-conversation-id", convId);
  headers.set("x-conversation-token", conv.publicAccessToken);
  // Optional: widget can display source attributions after the stream ends.
  if (sources.length > 0) {
    headers.set("x-sources", JSON.stringify(sources));
  }

  return new Response(streamResponse.body, { status: 200, headers });
}
