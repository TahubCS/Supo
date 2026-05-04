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
} from "@/lib/ably";
import { requireProductAccess } from "@/lib/product-access";
import { findWidgetConversation } from "@/lib/widget-conversation-access";

// CORS — widget token requests are cross-origin (widget.js from any domain).
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

    const channelName = conversationChannelName(orgId, conversationId);
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

  const capability = {
    [inboxChannelName(orgId, productId)]: ["subscribe", "publish"],
    [presenceChannelName(orgId, productId)]: ["subscribe", "presence"],
    // Wildcard: agent can subscribe to any conversation in their org.
    [`org:${orgId}:conversation:*`]: ["subscribe"],
  };

  const tokenRequest = await createTokenRequest(capability, `agent:${access.session.user.id}`);

  if (!tokenRequest) {
    return NextResponse.json({ error: "Realtime not configured" }, { status: 503 });
  }

  return NextResponse.json({ ...tokenRequest, orgId });
}
