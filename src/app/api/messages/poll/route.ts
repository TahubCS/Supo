import { and, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { message, product } from "@/db/schema";
import {
  getSecurityIp,
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";

// Same CORS policy as /api/chat — widget runs on any customer domain.
const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function quotaErrorResponse(error: unknown) {
  if (!isSecurityQuotaError(error)) return null;
  const headers = new Headers(CORS);
  headers.set("Content-Type", "application/json");
  if (error.retryAfter) {
    headers.set("Retry-After", String(error.retryAfter));
  }

  return NextResponse.json({ error: error.message }, { status: error.status, headers });
}

function parseSinceDate(value: string | null): Date | null {
  if (!value) return new Date(0);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }

  return parsed;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const conversationId = searchParams.get("conversationId");
  const conversationToken = searchParams.get("conversationToken");
  const productId = searchParams.get("productId");
  const since = searchParams.get("since");

  if (!conversationId || !conversationToken || !productId) {
    return NextResponse.json(
      { error: "conversationId, conversationToken, and productId are required" },
      { status: 400, headers: CORS },
    );
  }

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const conv = await findWidgetConversation({
    conversationId,
    productId,
    conversationToken,
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const sinceDate = parseSinceDate(since);
  if (!sinceDate) {
    return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400, headers: CORS });
  }

  try {
    const ip = getSecurityIp(req.headers);
    const event = {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/messages/poll",
      method: "GET",
      metadata: { conversationId },
    };
    await requireSecurityQuota(
      "messages.poll.conversation.minute",
      conversationToken,
      event,
    );
    await requireSecurityQuota(
      "messages.poll.ip.minute",
      `${productId}:${ip}`,
      {
        ...event,
        metadata: {
          ...event.metadata,
          ip: safeQuotaKey(ip),
        },
      },
    );
  } catch (error) {
    const response = quotaErrorResponse(error);
    if (response) return response;
    throw error;
  }

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
