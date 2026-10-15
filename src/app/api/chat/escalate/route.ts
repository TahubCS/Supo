import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, product } from "@/db/schema";
import { publishToConversation, publishToProductInbox } from "@/lib/ably";
import {
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";
import {
  normalizeWidgetCustomer,
  resolveWidgetCustomer,
  type WidgetCustomerInput,
} from "@/lib/widget-customer";
import { widgetCorsHeaders } from "@/lib/widget-cors";
import { checkWidgetOrigin } from "@/lib/widget-origin";

const METHODS = "POST, OPTIONS";

export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: widgetCorsHeaders(req.headers.get("origin"), null, METHODS),
  });
}

type EscalateRequest = {
  productId: string;
  conversationId: string;
  conversationToken?: string;
  customer: WidgetCustomerInput;
};

export async function POST(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null, METHODS);
  let body: EscalateRequest;
  try {
    body = (await req.json()) as EscalateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { productId, conversationId, conversationToken, customer: customerInfo } = body;
  const normalizedCustomer = normalizeWidgetCustomer(customerInfo);

  if (!productId || !conversationId || !conversationToken || !normalizedCustomer) {
    return NextResponse.json(
      { error: "productId, conversationId, conversationToken, and a valid customer.externalId/customer.id or customer.email are required" },
      { status: 400, headers: CORS },
    );
  }

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const originCheck = await checkWidgetOrigin(req.headers, productId, METHODS);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

  try {
    await requireSecurityQuota("chat.escalate.conversation", conversationId, {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/chat/escalate",
      method: "POST",
      metadata: { customerIdentity: safeQuotaKey(normalizedCustomer.identityKey) },
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
  const resolvedCustomer = await resolveWidgetCustomer({
    organizationId: foundProduct.organizationId,
    input: customerInfo,
  });
  if (!resolvedCustomer) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const cust = resolvedCustomer.customer;

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
      assigneeId: null,
      updatedAt: now,
    })
    .where(eq(conversation.id, conv.id));

  // Publish real-time events — fire-and-forget; never block the API response.
  Promise.allSettled([
    publishToConversation(foundProduct.organizationId, productId, conv.id, "escalation_update", {
      status: "pending",
    }),
    publishToProductInbox(foundProduct.organizationId, productId, "needs_agent", {
      conversationId: conv.id,
      subject: conv.subject,
      customerName: cust.name,
      escalatedAt: now.toISOString(),
    }),
    publishToProductInbox(foundProduct.organizationId, productId, "conversation_updated", {
      conversationId: conv.id,
      status: "open",
      escalationStatus: "pending",
      assigneeId: null,
      aiHandled: false,
    }),
  ]).catch(() => {});

  return NextResponse.json({ ok: true, escalationStatus: "pending" }, { headers: CORS });
}
