import { and, eq, isNull } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { db } from "@/db";
import { apiKey, product } from "@/db/schema";
import { isSecurityQuotaError, requireSecurityQuota } from "@/lib/security";

import { apiError } from "./http";
import { hashApiKey, hasScope, readApiKey, type ApiScope } from "./keys";

export type ApiContext = {
  keyId: string;
  keyName: string;
  productId: string;
  organizationId: string;
  scopes: string[];
};

const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Authenticates `Authorization: Bearer supo_sk_…` and checks the scope.
 * Returns the context, or an error response to send back as is.
 */
export async function authenticateApi(req: Request, scope: ApiScope): Promise<ApiContext | NextResponse> {
  const key = readApiKey(req.headers);
  if (!key) {
    return apiError(401, "unauthorized", "Send your API key as `Authorization: Bearer supo_sk_…`", {
      "WWW-Authenticate": 'Bearer realm="supo"',
    });
  }

  const [row] = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      productId: apiKey.productId,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      organizationId: product.organizationId,
    })
    .from(apiKey)
    .innerJoin(product, eq(product.id, apiKey.productId))
    .where(and(eq(apiKey.keyHash, hashApiKey(key)), isNull(apiKey.revokedAt)))
    .limit(1);
  if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) {
    return apiError(401, "unauthorized", "This API key is invalid, expired or revoked");
  }
  if (!hasScope(row.scopes, scope)) {
    return apiError(403, "insufficient_scope", `This API key needs the "${scope}" scope`);
  }

  try {
    await requireSecurityQuota("api.key.minute", row.id, {
      organizationId: row.organizationId,
      productId: row.productId,
      headerList: req.headers,
      path: new URL(req.url).pathname,
      method: req.method,
    });
  } catch (error) {
    if (isSecurityQuotaError(error)) {
      return apiError(429, "rate_limited", error.message, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined);
    }
    throw error;
  }

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));
  }
  return {
    keyId: row.id,
    keyName: row.name,
    productId: row.productId,
    organizationId: row.organizationId,
    scopes: row.scopes,
  };
}

export function isApiContext(value: ApiContext | NextResponse): value is ApiContext {
  return "keyId" in value;
}
