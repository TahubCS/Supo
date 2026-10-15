import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { product } from "@/db/schema";
import { getHelpCenterForProduct, helpCenterUrl, listPopularArticles } from "@/lib/help-center/service";
import { normalizeWidgetConfig } from "@/lib/widget-config";
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
  const originCheck = await checkWidgetOrigin(req.headers, productId, METHODS);
  if (!originCheck.allowed) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: originCheck.cors });
  }
  CORS = originCheck.cors;

  // Popular help center articles, shown as suggestions when the widget opens.
  const center = await getHelpCenterForProduct(productId);
  const helpCenter = center?.enabled
    ? {
        url: helpCenterUrl(center.slug),
        articles: (await listPopularArticles(productId, 3)).map((item) => ({
          title: item.title,
          url: helpCenterUrl(center.slug, item.slug),
        })),
      }
    : null;

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
      helpCenter,
    },
    { headers: CORS },
  );
}
