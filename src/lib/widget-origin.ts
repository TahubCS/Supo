import { eq } from "drizzle-orm";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { env } from "@/lib/env";
import { isOriginAllowed, isSameOriginRequest, widgetCorsHeaders } from "@/lib/widget-cors";

function trustedOrigins(): string[] {
  try {
    return Array.from(
      new Set(
        [new URL(env.BETTER_AUTH_URL).origin, "https://supo.muhammadtahubkhatri.dev"].filter(
          Boolean,
        ),
      ),
    );
  } catch {
    return ["https://supo.muhammadtahubkhatri.dev"];
  }
}

export type WidgetOriginCheck = {
  allowed: boolean;
  cors: Headers;
};

/**
 * Applies a product's widget origin allow-list. Supo's own pages are always
 * trusted, so the in-app preview and the landing-page demo keep working.
 */
export async function checkWidgetOrigin(
  headers: Headers,
  productId: string,
  methods = "GET, POST, OPTIONS",
): Promise<WidgetOriginCheck> {
  const origin = headers.get("origin");
  const row = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, productId),
    columns: { allowedOrigins: true },
  });
  const allowedOrigins = row?.allowedOrigins ?? [];

  return {
    allowed: isSameOriginRequest(headers) || isOriginAllowed(origin, allowedOrigins, trustedOrigins()),
    cors: widgetCorsHeaders(origin, allowedOrigins, methods),
  };
}
