import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  conversation,
  customer,
  message,
  product,
} from "@/db/schema";
import { env } from "@/lib/env";
import { geminiEmbed, resolveGenerationModel } from "@/lib/knowledge/ai";

export const maxDuration = 60;

// Widget runs on any customer domain — CORS must be fully open.
const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  const config = found.widgetConfigs[0];
  return NextResponse.json(
    {
      botName: config?.botName ?? "Support",
      greeting: config?.greeting ?? "Hi there! How can I help you today?",
      position: config?.position ?? "bottom-right",
      theme: config?.theme ?? "dark",
      accentColor: config?.accentColor ?? "#18181b",
    },
    { headers: CORS },
  );
}

type ChatRequest = {
  productId: string;
  message: string;
  conversationId?: string;
  customer: { name: string; email: string };
};

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { productId, message: userMessage, conversationId, customer: customerInfo } = body;

  if (!productId || !userMessage?.trim() || !customerInfo?.email || !customerInfo?.name) {
    return NextResponse.json(
      { error: "productId, message, customer.name, and customer.email are required" },
      { status: 400, headers: CORS },
    );
  }

  // ── Product + widget config ──────────────────────────────────────────────
  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
    with: { widgetConfigs: true },
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const config = foundProduct.widgetConfigs[0] ?? null;
  const botName = config?.botName ?? "Support";

  // ── Customer upsert ──────────────────────────────────────────────────────
  let cust = await db.query.customer.findFirst({
    where: and(
      eq(customer.organizationId, foundProduct.organizationId),
      eq(customer.email, customerInfo.email.toLowerCase()),
    ),
  });

  const now = new Date();

  if (!cust) {
    const custId = crypto.randomUUID();
    await db.insert(customer).values({
      id: custId,
      organizationId: foundProduct.organizationId,
      name: customerInfo.name,
      email: customerInfo.email.toLowerCase(),
      createdAt: now,
    });
    cust = {
      id: custId,
      organizationId: foundProduct.organizationId,
      name: customerInfo.name,
      email: customerInfo.email.toLowerCase(),
      createdAt: now,
    };
  }

  // ── Conversation get-or-create ───────────────────────────────────────────
  let conv = conversationId
    ? await db.query.conversation.findFirst({
        where: and(
          eq(conversation.id, conversationId),
          eq(conversation.productId, productId),
          eq(conversation.customerId, cust.id),
        ),
      })
    : null;

  if (!conv) {
    const convId = crypto.randomUUID();
    await db.insert(conversation).values({
      id: convId,
      productId,
      customerId: cust.id,
      status: "open",
      aiHandled: true,
      subject: userMessage.trim().slice(0, 80),
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
      subject: userMessage.trim().slice(0, 80),
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
  }

  // ── Save customer message ────────────────────────────────────────────────
  await db.insert(message).values({
    id: crypto.randomUUID(),
    conversationId: conv.id,
    body: userMessage.trim(),
    senderType: "customer",
    senderId: null,
    createdAt: now,
  });

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

  try {
    const queryEmbedding = await geminiEmbed(userMessage, productId);
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
  const result = streamText({
    model: google(modelId),
    system: systemLines,
    messages: chatMessages,
    onFinish: async ({ text }) => {
      const finishAt = new Date();
      await db.insert(message).values({
        id: crypto.randomUUID(),
        conversationId: convId,
        body: text,
        senderType: "ai",
        senderId: null,
        createdAt: finishAt,
      });
      await db
        .update(conversation)
        .set({ lastMessageAt: finishAt, updatedAt: finishAt, aiHandled: true })
        .where(eq(conversation.id, convId));
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
  // Optional: widget can display source attributions after the stream ends.
  if (sources.length > 0) {
    headers.set("x-sources", JSON.stringify(sources));
  }

  return new Response(streamResponse.body, { status: 200, headers });
}
