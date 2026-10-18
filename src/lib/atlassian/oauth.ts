import { env } from "@/lib/env";

// Atlassian OAuth 2.0 (3LO): the authorize URL, code exchange, token refresh
// and the list of sites a token can reach. API calls themselves go through
// the api.atlassian.com gateway (see connection.ts).

const AUTH_BASE = "https://auth.atlassian.com";
export const ATLASSIAN_API = "https://api.atlassian.com";
const REQUEST_TIMEOUT_MS = 15_000;

// Granular scopes required by the Confluence v2 API; offline_access returns a
// refresh token.
export const ATLASSIAN_SCOPES = ["read:space:confluence", "read:page:confluence", "offline_access"];
const PAGE_SCOPE = "read:page:confluence";

export class AtlassianApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // OAuth error code, e.g. "invalid_grant" for a revoked refresh token.
    readonly code?: string,
  ) {
    super(message);
  }
}

export type AtlassianTokens = { accessToken: string; refreshToken: string; expiresAt: Date; scopes: string };

export type AtlassianSite = { cloudId: string; url: string; name: string };

export const ACCESSIBLE_RESOURCES_PATH = "/oauth/token/accessible-resources";

export type AccessibleResource = { id: string; url: string; name: string; scopes?: string[] };

export function isAtlassianConfigured(): boolean {
  return Boolean(env.ATLASSIAN_CLIENT_ID && env.ATLASSIAN_CLIENT_SECRET && env.INTEGRATIONS_ENCRYPTION_KEY);
}

function requireConfig() {
  if (!isAtlassianConfigured()) throw new Error("The Atlassian integration is not configured on this server");
  return { clientId: env.ATLASSIAN_CLIENT_ID!, clientSecret: env.ATLASSIAN_CLIENT_SECRET! };
}

export function atlassianCallbackUrl(): string {
  return new URL("/api/integrations/atlassian/callback", env.BETTER_AUTH_URL).toString();
}

export function atlassianAuthorizeUrl(state: string): string {
  const { clientId } = requireConfig();
  const params = new URLSearchParams({
    audience: ATLASSIAN_API.replace("https://", ""),
    client_id: clientId,
    scope: ATLASSIAN_SCOPES.join(" "),
    redirect_uri: atlassianCallbackUrl(),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${params}`;
}

async function errorFrom(response: Response): Promise<AtlassianApiError> {
  let code: string | undefined;
  let detail = "";
  try {
    const body = (await response.json()) as { error?: string; error_description?: string; message?: string };
    code = body.error;
    detail = body.error_description ?? body.message ?? body.error ?? "";
  } catch {
    // non-JSON error body
  }
  return new AtlassianApiError(`Atlassian API ${response.status}${detail ? `: ${detail}` : ""}`, response.status, code);
}

async function tokenRequest(grant: Record<string, string>): Promise<AtlassianTokens> {
  const { clientId, clientSecret } = requireConfig();
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...grant }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw await errorFrom(response);
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== "number") {
    throw new AtlassianApiError("Atlassian returned an incomplete token response", response.status);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope ?? "",
  };
}

export function exchangeAtlassianCode(code: string): Promise<AtlassianTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: atlassianCallbackUrl() });
}

/** Atlassian rotates the refresh token on every call: persist the returned one. */
export function refreshAtlassianTokens(refreshToken: string): Promise<AtlassianTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** The resources a grant can read Confluence pages on. */
export function confluenceSites(resources: AccessibleResource[]): AtlassianSite[] {
  return resources
    .filter((resource) => resource.scopes?.includes(PAGE_SCOPE))
    .map((resource) => ({ cloudId: resource.id, url: resource.url, name: resource.name }));
}

/** Sites a freshly issued token can read Confluence pages on. */
export async function listAccessibleSites(accessToken: string): Promise<AtlassianSite[]> {
  const response = await fetch(`${ATLASSIAN_API}${ACCESSIBLE_RESOURCES_PATH}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw await errorFrom(response);
  return confluenceSites((await response.json()) as AccessibleResource[]);
}
