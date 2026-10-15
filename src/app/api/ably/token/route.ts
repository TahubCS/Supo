import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { product } from "@/db/schema";
import {
  conversationChannelName,
  createTokenRequest,
  getPresenceCount,
  inboxChannelName,
  presenceChannelName,
  productConversationsChannelPattern,
} from "@/lib/ably";
import { requireProductAccess } from "@/lib/product-access";
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

export async function GET(req: NextRequest) {
  let CORS = widgetCorsHeaders(req.headers.get("origin"), null, METHODS);
  const { searchParams } = req.nextUrl;
  const productId = searchParams.get("productId");
  const conversationId = searchParams.get("conversationId");
  const conversationToken = searchParams.get("conversationToken");
  const presenceOnly = searchParams.get("presenceOnly") === "true";

  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400, headers: CORS });
  }

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }
  // Agent tokens are same-origin dashboard requests and are authorized by session below.
  if (presenceOnly || conversationId) {
    const originCheck = await checkWidgetOrigin(req.headers, productId, METHODS);
    if (!originCheck.allowed) {
      return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
    }
    CORS = originCheck.cors;
  }

  const orgId = foundProduct.organizationId;

  // ── Presence count — widget calls this before escalating ─────────────────
  // No auth required: returns public presence count for the product inbox.
  if (presenceOnly) {
    const count = await getPresenceCount(orgId, productId);
    return NextResponse.json({ count }, { headers: CORS });
  }

  // ── Widget conversation token ─────────────────────────────────────────────
  // No session required. Validates conversationId belongs to productId.
  if (conversationId) {
    if (!conversationToken) {
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

    const channelName = conversationChannelName(orgId, productId, conversationId);
    const tokenRequest = await createTokenRequest(
      { [channelName]: ["subscribe"] },
      `widget:${conversationId}`,
    );

    if (!tokenRequest) {
      return NextResponse.json(
        { error: "Realtime not configured" },
        { status: 503, headers: CORS },
      );
    }

    // Return tokenRequest + the exact channel name the widget should subscribe to.
    return NextResponse.json({ ...tokenRequest, channelName }, { headers: CORS });
  }

  // ── Agent inbox token ─────────────────────────────────────────────────────
  // Requires product-level inbox access. Sidebar visibility is not a security boundary.
  let access: Awaited<ReturnType<typeof requireProductAccess>>;
  try {
    access = await requireProductAccess(productId, ["inbox"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Scoped to this product only. Inbox events are published by the server,
  // so agents get subscribe-only access (no spoofed inbox events).
  const capability = {
    [inboxChannelName(orgId, productId)]: ["subscribe"],
    [presenceChannelName(orgId, productId)]: ["subscribe", "presence"],
    [productConversationsChannelPattern(orgId, productId)]: ["subscribe"],
  };

  const tokenRequest = await createTokenRequest(capability, `agent:${access.session.user.id}`);

  if (!tokenRequest) {
    return NextResponse.json({ error: "Realtime not configured" }, { status: 503 });
  }

  return NextResponse.json({ ...tokenRequest, orgId });
}
