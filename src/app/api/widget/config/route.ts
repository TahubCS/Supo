import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { product } from "@/db/schema";
import { normalizeWidgetConfig } from "@/lib/widget-config";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400, headers: CORS });
  }

  const found = await db.query.product.findFirst({
    where: eq(product.id, productId),
    with: { widgetConfigs: true },
  });
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  return NextResponse.json(
    {
      productId,
      appearance: normalizeWidgetConfig(found.widgetConfigs[0]),
      endpoints: {
        messages: "/api/widget/messages",
        escalations: "/api/widget/escalations",
        poll: "/api/widget/messages/poll",
        realtimeToken: "/api/widget/realtime/token",
      },
      features: {
        realtime: true,
        pollingFallback: true,
        betaNotice: true,
      },
    },
    { headers: CORS },
  );
}
