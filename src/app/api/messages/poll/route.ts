import { and, asc, eq, gt, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { conversation, customer, message, product, user, widgetConfig } from "@/db/schema";
import { shouldRequestRating } from "@/lib/csat/service";
import { maybeNotifyHandoffTimeout } from "@/lib/handoff/service";
import { drainSoon } from "@/lib/jobs/queue";
import {
  getSecurityIp,
  isSecurityQuotaError,
  requireSecurityQuota,
  safeQuotaKey,
} from "@/lib/security";
import { findWidgetConversation } from "@/lib/widget-conversation-access";
import { widgetCorsHeaders } from "@/lib/widget-cors";
import { checkWidgetOrigin } from "@/lib/widget-origin";

const METHODS = "GET, OPTIONS";

export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: widgetCorsHeaders(req.headers.get("origin"), null, METHODS),
  });
}

function quotaErrorResponse(error: unknown, cors: Headers) {
  if (!isSecurityQuotaError(error)) return null;
  const headers = new Headers(cors);
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
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null, METHODS);
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
  const originCheck = await checkWidgetOrigin(req.headers, productId, METHODS);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

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
    const response = quotaErrorResponse(error, CORS);
    if (response) return response;
    throw error;
  }

  // Lossless cursor: `after` is the last message seq the client has seen.
  // `since` (timestamp) is kept for older widget builds.
  const afterParam = searchParams.get("after");
  const afterSeq = afterParam !== null && /^\d{1,15}$/.test(afterParam) ? Number(afterParam) : null;

  const rows = await db
    .select({
      id: message.id,
      seq: message.seq,
      body: message.body,
      senderType: message.senderType,
      sources: message.sources,
      createdAt: message.createdAt,
      senderName: user.name,
    })
    .from(message)
    .leftJoin(user, eq(user.id, message.senderId))
    .where(
      and(
        eq(message.conversationId, conversationId),
        // Internal notes are never visible to customers.
        ne(message.senderType, "note"),
        afterSeq !== null ? gt(message.seq, afterSeq) : gt(message.createdAt, sinceDate),
      ),
    )
    .orderBy(asc(message.seq))
    .limit(200);

  // Track presence (throttled) so agents' replies are emailed only when the
  // customer has actually left.
  const now = Date.now();
  if (!conv.customerLastSeenAt || now - conv.customerLastSeenAt.getTime() > 30_000) {
    await db
      .update(conversation)
      .set({ customerLastSeenAt: new Date(now) })
      .where(eq(conversation.id, conv.id));
  }

  const [widgetRow, cust] = await Promise.all([
    db.query.widgetConfig.findFirst({
      where: eq(widgetConfig.productId, productId),
      columns: { handoffTimeoutSec: true },
    }),
    db.query.customer.findFirst({ where: eq(customer.id, conv.customerId), columns: { email: true } }),
  ]);
  if (conv.escalationStatus === "pending") {
    // Customers waiting for a human keep the job queue (and SLA warnings)
    // moving between cron runs. Throttled per instance.
    drainSoon();
    await maybeNotifyHandoffTimeout({
      orgId: foundProduct.organizationId,
      productId,
      conv,
      timeoutSec: widgetRow?.handoffTimeoutSec ?? 300,
      customerEmail: cust?.email ?? null,
    }).catch((error) => console.error("[poll] handoff timeout check failed", error));
  }
  const fresh = await db.query.conversation.findFirst({
    where: eq(conversation.id, conv.id),
    columns: {
      escalationStatus: true,
      handoffTimeoutNotifiedAt: true,
      followUpEmail: true,
      lastMessageAt: true,
      status: true,
      resolvedAt: true,
    },
  });
  const escalationStatus = fresh?.escalationStatus ?? conv.escalationStatus;
  const needsEmail =
    escalationStatus === "pending" &&
    Boolean(fresh?.handoffTimeoutNotifiedAt) &&
    !(fresh?.followUpEmail ?? cust?.email);
  const ratingRequested = await shouldRequestRating({
    id: conv.id,
    productId,
    status: fresh?.status ?? conv.status,
    resolvedAt: fresh ? fresh.resolvedAt : conv.resolvedAt,
  }).catch(() => false);

  return NextResponse.json(
    {
      messages: rows.map((m) => ({
        id: m.id,
        seq: m.seq,
        body: m.body,
        senderType: m.senderType,
        senderName: m.senderType === "agent" ? (m.senderName ?? "Support") : undefined,
        sources: m.sources ?? undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      cursor: rows.at(-1)?.seq ?? afterSeq,
      escalationStatus,
      needsEmail,
      ratingRequested,
      lastMessageAt: (fresh?.lastMessageAt ?? conv.lastMessageAt).toISOString(),
    },
    { headers: CORS },
  );
}
