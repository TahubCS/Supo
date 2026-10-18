import { eq } from "drizzle-orm";

import { db } from "@/db";
import { atlassianConnection } from "@/db/schema";
import { openSecret, sealSecret } from "@/lib/crypto/secret-box";

import {
  ATLASSIAN_API,
  AtlassianApiError,
  refreshAtlassianTokens,
  type AtlassianTokens,
} from "./oauth";

// The workspace's Atlassian grant: sealed token storage, an access token that
// is refreshed before it expires, and authenticated gateway requests.

const EXPIRY_SKEW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

export const REAUTH_MESSAGE = "Confluence access has expired or was revoked. Reconnect Confluence to keep syncing.";

export class AtlassianReauthRequiredError extends Error {
  constructor() {
    super(REAUTH_MESSAGE);
  }
}

export type AtlassianConnection = typeof atlassianConnection.$inferSelect;

// Sealed values are bound to their workspace (the row's unique key, known
// before an upsert picks the row) and purpose, so a token copied into another
// row or column does not decrypt.
function tokenContext(organizationId: string, kind: "access" | "refresh"): string {
  return `atlassian_connection:${organizationId}:${kind}`;
}

function sealedTokens(organizationId: string, tokens: AtlassianTokens) {
  return {
    accessToken: sealSecret(tokens.accessToken, tokenContext(organizationId, "access")),
    refreshToken: sealSecret(tokens.refreshToken, tokenContext(organizationId, "refresh")),
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  };
}

/** Stores a new grant for the workspace, replacing any previous one. */
export async function saveAtlassianConnection(
  organizationId: string,
  userId: string,
  tokens: AtlassianTokens,
): Promise<AtlassianConnection> {
  const now = new Date();
  const values = { ...sealedTokens(organizationId, tokens), status: "active", updatedAt: now };
  const [row] = await db
    .insert(atlassianConnection)
    .values({ id: crypto.randomUUID(), organizationId, createdById: userId, createdAt: now, ...values })
    .onConflictDoUpdate({ target: atlassianConnection.organizationId, set: values })
    .returning();
  return row;
}

export async function findAtlassianConnection(organizationId: string): Promise<AtlassianConnection | undefined> {
  return db.query.atlassianConnection.findFirst({ where: eq(atlassianConnection.organizationId, organizationId) });
}

/** Removes the grant; its Confluence sources and their passages go with it. */
export async function deleteAtlassianConnection(organizationId: string): Promise<void> {
  await db.delete(atlassianConnection).where(eq(atlassianConnection.organizationId, organizationId));
}

/**
 * A usable access token, refreshed when it is about to expire (or when `force`
 * is set after a 401). Atlassian invalidates the old refresh token on every
 * refresh, so the refresh runs under a row lock: concurrent callers wait and
 * reuse the token the first one stored instead of spending the same refresh
 * token twice.
 */
export async function getAccessToken(connectionId: string, { force = false } = {}): Promise<string> {
  const current = await db.query.atlassianConnection.findFirst({ where: eq(atlassianConnection.id, connectionId) });
  if (!current || current.status !== "active") throw new AtlassianReauthRequiredError();
  if (!force && current.expiresAt.getTime() - Date.now() > EXPIRY_SKEW_MS) {
    return openSecret(current.accessToken, tokenContext(current.organizationId, "access"));
  }

  const outcome = await db.transaction(async (tx): Promise<{ token: string } | { reauth: true }> => {
    const [locked] = await tx
      .select()
      .from(atlassianConnection)
      .where(eq(atlassianConnection.id, connectionId))
      .for("update");
    if (!locked || locked.status !== "active") return { reauth: true };

    // Another request refreshed while this one waited for the lock.
    if (locked.accessToken !== current.accessToken) {
      return { token: openSecret(locked.accessToken, tokenContext(locked.organizationId, "access")) };
    }

    let tokens: AtlassianTokens;
    try {
      tokens = await refreshAtlassianTokens(
        openSecret(locked.refreshToken, tokenContext(locked.organizationId, "refresh")),
      );
    } catch (error) {
      if (error instanceof AtlassianApiError && error.code === "invalid_grant") {
        await tx
          .update(atlassianConnection)
          .set({ status: "reauth_required", updatedAt: new Date() })
          .where(eq(atlassianConnection.id, connectionId));
        return { reauth: true };
      }
      throw error;
    }

    await tx
      .update(atlassianConnection)
      .set({ ...sealedTokens(locked.organizationId, tokens), updatedAt: new Date() })
      .where(eq(atlassianConnection.id, connectionId));
    return { token: tokens.accessToken };
  });

  if ("reauth" in outcome) throw new AtlassianReauthRequiredError();
  return outcome.token;
}

async function gatewayFetch(path: string, token: string): Promise<Response> {
  return fetch(`${ATLASSIAN_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** GET through the api.atlassian.com gateway; `path` starts with "/". */
export async function atlassianGet<T>(connectionId: string, path: string): Promise<T> {
  let response = await gatewayFetch(path, await getAccessToken(connectionId));
  // A token revoked before its expiry: refresh once and retry.
  if (response.status === 401) response = await gatewayFetch(path, await getAccessToken(connectionId, { force: true }));
  if (!response.ok) {
    let detail = "";
    try {
      detail = ((await response.json()) as { message?: string }).message ?? "";
    } catch {
      // non-JSON error body
    }
    throw new AtlassianApiError(`Confluence API ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
  }
  return (await response.json()) as T;
}
