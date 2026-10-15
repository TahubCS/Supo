import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, product } from "@/db/schema";
import { publishToProductInbox } from "@/lib/ably";
import { postSystemMessage } from "@/lib/handoff/service";
import { isSecurityQuotaError, requireSecurityQuota } from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";
import { widgetCorsHeaders } from "@/lib/widget-cors";
import { isValidCustomerEmail } from "@/lib/widget-customer";
import { checkWidgetOrigin } from "@/lib/widget-origin";

const METHODS = "POST, OPTIONS";

export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: widgetCorsHeaders(req.headers.get("origin"), null, METHODS),
  });
}

// Lets a waiting customer leave an email address for follow-up when no
// agent is available. Stored on the conversation (not the customer record),
// so an unverified widget session can't change a customer's profile.
export async function POST(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null, METHODS);
  let body: { productId?: string; conversationId?: string; conversationToken?: string; email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const productId = body.productId?.trim();
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!productId || !body.conversationId || !body.conversationToken) {
    return NextResponse.json({ error: "productId, conversationId and conversationToken are required" }, { status: 400, headers: CORS });
  }
  if (!isValidCustomerEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400, headers: CORS });
  }

  const foundProduct = await db.query.product.findFirst({ where: eq(product.id, productId) });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  const originCheck = await checkWidgetOrigin(req.headers, productId, METHODS);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

  try {
    await requireSecurityQuota("chat.escalate.conversation", body.conversationId, {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/widget/contact",
      method: "POST",
    });
  } catch (error) {
    if (isSecurityQuotaError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: CORS });
    }
    throw error;
  }

  const conv = await findWidgetConversation({
    conversationId: body.conversationId,
    productId,
    conversationToken: body.conversationToken,
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  await db
    .update(conversation)
    .set({ followUpEmail: email, updatedAt: new Date() })
    .where(eq(conversation.id, conv.id));

  await postSystemMessage({
    orgId: foundProduct.organizationId,
    productId,
    conversationId: conv.id,
    body: `Thanks! We'll reply to ${email}.`,
  });
  publishToProductInbox(foundProduct.organizationId, productId, "conversation_updated", {
    conversationId: conv.id,
    followUpEmail: email,
  }).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: CORS });
}
