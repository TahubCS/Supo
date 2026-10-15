import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { product } from "@/db/schema";
import { publishToProductInbox } from "@/lib/ably";
import { isCsatEnabled, isWithinRatingWindow, parseRatingInput, submitRating } from "@/lib/csat/service";
import { isSecurityQuotaError, requireSecurityQuota } from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";
import { widgetCorsHeaders } from "@/lib/widget-cors";
import { checkWidgetOrigin } from "@/lib/widget-origin";

const METHODS = "POST, OPTIONS";

export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: widgetCorsHeaders(req.headers.get("origin"), null, METHODS),
  });
}

// CSAT: the customer rates a resolved conversation (1-5 plus an optional
// comment). Authenticated by the conversation token like every widget call.
export async function POST(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null, METHODS);
  let body: {
    productId?: string;
    conversationId?: string;
    conversationToken?: string;
    score?: unknown;
    comment?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId || typeof body.conversationId !== "string" || typeof body.conversationToken !== "string") {
    return NextResponse.json(
      { error: "productId, conversationId and conversationToken are required" },
      { status: 400, headers: CORS },
    );
  }
  const input = parseRatingInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400, headers: CORS });
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
    await requireSecurityQuota("widget.rating.conversation", body.conversationId, {
      organizationId: foundProduct.organizationId,
      productId,
      headerList: req.headers,
      path: "/api/widget/ratings",
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
  if (!(await isCsatEnabled(productId))) {
    return NextResponse.json({ error: "Ratings are turned off" }, { status: 403, headers: CORS });
  }
  if (!isWithinRatingWindow(conv)) {
    return NextResponse.json(
      { error: "Only recently resolved conversations can be rated" },
      { status: 409, headers: CORS },
    );
  }

  const rating = await submitRating(conv, input);
  publishToProductInbox(foundProduct.organizationId, productId, "conversation_updated", {
    conversationId: conv.id,
    rating: { score: rating.score, comment: rating.comment },
  }).catch(() => {});

  return NextResponse.json({ ok: true, score: rating.score }, { headers: CORS });
}
