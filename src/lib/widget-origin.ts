import { eq } from "drizzle-orm";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { env } from "@/lib/env";
import { isOriginAllowed, widgetCorsHeaders } from "@/lib/widget-cors";

function trustedOrigins(): string[] {
  try {
    return [new URL(env.BETTER_AUTH_URL).origin];
  } catch {
    return [];
  }
}

export type WidgetOriginCheck = {
  allowed: boolean;
  cors: Headers;
};

/**
 * Applies a product's widget origin allow-list. The Supo dashboard origin is
 * always trusted so the in-app widget preview keeps working.
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
    allowed: isOriginAllowed(origin, allowedOrigins, trustedOrigins()),
    cors: widgetCorsHeaders(origin, allowedOrigins, methods),
  };
}
