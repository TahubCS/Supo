import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, customer, product } from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import {
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";

// Same CORS policy as /api/chat — widget runs on any customer domain.
const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type EscalateRequest = {
  productId: string;
  conversationId: string;
  conversationToken?: string;
  customer: { name: string; email: string };
};

export async function POST(req: NextRequest) {
  let body: EscalateRequest;
  try {
    body = (await req.json()) as EscalateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { productId, conversationId, conversationToken, customer: customerInfo } = body;
  const customerEmail = customerInfo?.email?.trim().toLowerCase() ?? "";

  if (!productId || !conversationId || !conversationToken || !customerEmail) {
    return NextResponse.json(
      { error: "productId, conversationId, conversationToken, and customer.email are required" },
      { status: 400, headers: CORS },
    );
  }

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  try {
    await requireSecurityQuota("chat.escalate.conversation", conversationId, {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/chat/escalate",
      method: "POST",
      metadata: { customerEmail: safeQuotaKey(customerEmail) },
    });
  } catch (error) {
    if (isSecurityQuotaError(error)) {
      const headers = new Headers(CORS);
      headers.set("Content-Type", "application/json");
      if (error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    throw error;
  }

  // Verify the conversation belongs to this product and customer.
  const cust = await db.query.customer.findFirst({
    where: and(
      eq(customer.organizationId, foundProduct.organizationId),
      eq(customer.email, customerEmail),
    ),
  });
  if (!cust) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  const conv = await findWidgetConversation({
    conversationId,
    productId,
    conversationToken,
    customerId: cust.id,
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  // Already escalated — return current status without re-escalating.
  if (conv.escalationStatus === "pending" || conv.escalationStatus === "active") {
    return NextResponse.json(
      { ok: true, escalationStatus: conv.escalationStatus },
      { headers: CORS },
    );
  }

  const now = new Date();
  await db
    .update(conversation)
    .set({
      escalationStatus: "pending",
      escalatedAt: now,
      aiHandled: false,
      updatedAt: now,
    })
    .where(eq(conversation.id, conv.id));

  // Publish real-time events — fire-and-forget; never block the API response.
  Promise.allSettled([
    publishToConversation(foundProduct.organizationId, conv.id, "escalation_update", {
      status: "pending",
    }),
    publishToProductInbox(foundProduct.organizationId, productId, "needs_agent", {
      conversationId: conv.id,
      subject: conv.subject,
      customerName: cust.name,
      escalatedAt: now.toISOString(),
    }),
  ]).catch(() => {});

  return NextResponse.json({ ok: true, escalationStatus: "pending" }, { headers: CORS });
}
