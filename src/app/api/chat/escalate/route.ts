import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { customer, product } from "@/db/schema";
import { escalateConversation } from "@/lib/handoff/service";
import {
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";
import { normalizeWidgetCustomer, type WidgetCustomerInput } from "@/lib/widget-customer";
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

  // The 64-character conversation token is the bearer credential.
  const conv = await findWidgetConversation({ conversationId, productId, conversationToken });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const cust = await db.query.customer.findFirst({
    where: eq(customer.id, conv.customerId),
    columns: { name: true, email: true },
  });

  const result = await escalateConversation({
    orgId: foundProduct.organizationId,
    productId,
    conversationId: conv.id,
    reason: "manual",
    subject: conv.subject,
    customerName: cust?.name ?? "Customer",
    customerEmail: cust?.email ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      escalationStatus: result.escalationStatus ?? "pending",
      availability: result.availability,
      needsEmail: result.needsEmail,
    },
    { headers: CORS },
  );
}
