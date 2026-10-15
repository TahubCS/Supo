// CORS + origin allow-list for the public widget API.
//
// When a product has no allowed origins configured the widget may be embedded
// anywhere (`Access-Control-Allow-Origin: *`). Once origins are configured,
// only matching browser origins are accepted and the origin is echoed back.

export const WIDGET_EXPOSED_HEADERS = [
  "x-conversation-id",
  "x-conversation-token",
  "x-sources",
  "x-escalation-status",
  "x-message-id",
  "x-ai-message-id",
  "x-reply-mode",
  "x-handoff-availability",
  "x-needs-email",
].join(", ");

export const MAX_ALLOWED_ORIGINS = 25;

function isDefaultPort(scheme: string, port: string): boolean {
  return (scheme === "https" && port === ":443") || (scheme === "http" && port === ":80");
}

/**
 * Normalizes one allow-list entry. Accepts full origins (`https://app.acme.com`),
 * bare hosts (`app.acme.com`, treated as https) and wildcard subdomains
 * (`*.acme.com`, `https://*.acme.com`). Returns null for invalid input.
 */
export function normalizeAllowedOrigin(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\/+$/, "");
  if (!value) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`;
  const match = withScheme.match(/^(https?):\/\/(\*\.)?([a-z0-9.-]+)(:\d{1,5})?$/);
  if (!match) return null;

  const [, scheme, wildcard = "", host, rawPort = ""] = match;
  if (!host.includes(".") && host !== "localhost") return null;
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  // Browsers omit default ports from Origin, so store them the same way.
  const port = isDefaultPort(scheme, rawPort) ? "" : rawPort;

  return `${scheme}://${wildcard}${host}${port}`;
}

export function parseAllowedOrigins(input: string | string[]): { origins: string[]; invalid: string[] } {
  const entries = (Array.isArray(input) ? input : input.split(/[\s,]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const origins: string[] = [];
  const invalid: string[] = [];

  for (const entry of entries) {
    const normalized = normalizeAllowedOrigin(entry);
    if (!normalized) invalid.push(entry);
    else if (!origins.includes(normalized)) origins.push(normalized);
  }

  return { origins: origins.slice(0, MAX_ALLOWED_ORIGINS), invalid };
}

export function isOriginAllowed(
  origin: string | null,
  allowedOrigins: readonly string[] | null | undefined,
  trustedOrigins: readonly string[] = [],
): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  if (!origin) return false;

  const normalized = origin.trim().toLowerCase().replace(/\/+$/, "");
  if (trustedOrigins.some((trusted) => trusted.toLowerCase().replace(/\/+$/, "") === normalized)) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  const scheme = url.protocol.replace(":", "");
  const hostWithPort = url.port ? `${url.hostname}:${url.port}` : url.hostname;

  return allowedOrigins.some((allowed) => {
    const match = allowed.match(/^(https?):\/\/(\*\.)?(.+)$/);
    if (!match) return false;
    const [, allowedScheme, wildcard, rawAllowedHost] = match;
    // Entries saved before default-port normalization may still carry :443/:80.
    const allowedHost = rawAllowedHost.replace(allowedScheme === "https" ? /:443$/ : /:80$/, "");
    if (allowedScheme !== scheme) return false;
    if (!wildcard) return allowedHost === hostWithPort;
    return hostWithPort.endsWith(`.${allowedHost}`);
  });
}

export function widgetCorsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[] | null | undefined,
  methods = "GET, POST, OPTIONS",
): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": WIDGET_EXPOSED_HEADERS,
  });

  if (allowedOrigins && allowedOrigins.length > 0) {
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  return headers;
}
