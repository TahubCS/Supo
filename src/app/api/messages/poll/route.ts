import { and, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, message, product } from "@/db/schema";

// Same CORS policy as /api/chat — widget runs on any customer domain.
const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const conversationId = searchParams.get("conversationId");
  const productId = searchParams.get("productId");
  const since = searchParams.get("since");

  if (!conversationId || !productId) {
    return NextResponse.json(
      { error: "conversationId and productId are required" },
      { status: 400, headers: CORS },
    );
  }

  // Verify the conversation belongs to this product (implicit auth — same
  // trust model as /api/chat where productId is the only identifier).
  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const conv = await db.query.conversation.findFirst({
    where: and(
      eq(conversation.id, conversationId),
      eq(conversation.productId, productId),
    ),
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const sinceDate = since ? new Date(since) : new Date(0);

  const messages = await db.query.message.findMany({
    where: and(
      eq(message.conversationId, conversationId),
      gt(message.createdAt, sinceDate),
    ),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  return NextResponse.json(
    {
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderType: m.senderType,
        createdAt: m.createdAt.toISOString(),
      })),
      escalationStatus: conv.escalationStatus,
      lastMessageAt: conv.lastMessageAt.toISOString(),
    },
    { headers: CORS },
  );
}
