import { lookup as lookupCallback, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

// Server-side fetch for user-supplied URLs (knowledge sources, crawlers).
// Blocks requests to private/internal networks (SSRF), bounds time and size,
// and re-validates every redirect hop.

export class SafeFetchError extends Error {}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  // Allowed media types (prefix match on the Content-Type header). Undefined = any.
  allowedContentTypes?: string[];
};

export type SafeFetchResult = {
  url: string;
  status: number;
  contentType: string;
  body: Uint8Array;
  text: () => string;
};

const USER_AGENT = "SupoBot/1.0 (+https://supo.app/bot)";

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr4(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(base) & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(ip);

  if (version === 4) return BLOCKED_V4.some((cidr) => inCidr4(ip, cidr));
  if (version !== 6) return true;

  // IPv4-mapped / translated IPv6 (::ffff:10.0.0.1)
  const mapped = ip.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  if (ip === "::" || ip === "::1") return true;
  const firstHextet = parseInt(ip.split(":")[0] || "0", 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (ip.startsWith("64:ff9b:")) return true; // NAT64
  if (ip.startsWith("2001:db8:")) return true; // documentation
  return false;
}

/** Validates scheme/host and resolves DNS, rejecting internal destinations. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${raw}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("Only http and https URLs are supported");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("URLs with credentials are not supported");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new SafeFetchError("This address is not reachable from Supo");
  }

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new SafeFetchError(`Could not resolve ${host}`);
      })).map((entry) => entry.address);

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new SafeFetchError("This address is not reachable from Supo");
  }

  return url;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * DNS lookup used for the actual TCP connection. Validating here (not only
 * before the request) closes the DNS-rebinding gap where a hostname resolves
 * to a public address during validation and to an internal one on connect.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOneOptions | LookupAllOptions | number | undefined,
  callback: LookupCallback,
): void {
  const opts = typeof options === "number" ? { family: options } : (options ?? {});
  lookupCallback(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      callback(new SafeFetchError("This address is not reachable from Supo") as NodeJS.ErrnoException, []);
      return;
    }
    if ((opts as LookupAllOptions).all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

let guardedAgent: Agent | null = null;
function getGuardedAgent(): Agent {
  guardedAgent ??= new Agent({ connect: { lookup: guardedLookup } });
  return guardedAgent;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new SafeFetchError(`Response too large (${declared} bytes)`);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SafeFetchError(`Response too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    timeoutMs = 15_000,
    maxBytes = 5 * 1024 * 1024,
    maxRedirects = 5,
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    allowedContentTypes,
  } = options;

  const signal = AbortSignal.timeout(timeoutMs);
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    let response: Response;
    try {
      response = (await undiciFetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        dispatcher: getGuardedAgent(),
      })) as unknown as Response;
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new SafeFetchError(`Timed out fetching ${url.toString()}`);
      }
      const cause = error instanceof Error && error.cause instanceof SafeFetchError ? error.cause : null;
      if (cause) throw cause;
      throw new SafeFetchError(`Could not fetch ${url.toString()}`);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = new URL(response.headers.get("location")!, url).toString();
      await response.body?.cancel().catch(() => {});
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new SafeFetchError(`HTTP ${response.status} fetching ${url.toString()}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      allowedContentTypes &&
      contentType &&
      !allowedContentTypes.some((type) => contentType.startsWith(type))
    ) {
      await response.body?.cancel().catch(() => {});
      throw new SafeFetchError(`Unsupported content type ${contentType.split(";")[0]}`);
    }

    const body = await readLimited(response, maxBytes);
    return {
      url: url.toString(),
      status: response.status,
      contentType,
      body,
      text: () => new TextDecoder("utf-8", { fatal: false }).decode(body),
    };
  }

  throw new SafeFetchError("Too many redirects");
}

export type SafePostResult = { status: number; body: string; durationMs: number };

/**
 * POSTs to a user-supplied URL (webhooks) through the same SSRF guard.
 * Redirects are not followed and non-2xx responses are returned, not thrown.
 */
export async function safePost(
  raw: string,
  { body, headers, timeoutMs = 10_000, maxResponseBytes = 4096 }: {
    body: string;
    headers: Record<string, string>;
    timeoutMs?: number;
    maxResponseBytes?: number;
  },
): Promise<SafePostResult> {
  const url = await assertPublicUrl(raw);
  const started = Date.now();
  let response: Response;
  try {
    response = (await undiciFetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json", ...headers },
      body,
      dispatcher: getGuardedAgent(),
    })) as unknown as Response;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SafeFetchError(`Timed out after ${timeoutMs / 1000}s`);
    }
    const cause = error instanceof Error && error.cause instanceof SafeFetchError ? error.cause : null;
    if (cause) throw cause;
    throw new SafeFetchError(`Could not connect to ${url.host}`);
  }
  let text = "";
  try {
    const bytes = await readLimited(response, maxResponseBytes);
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    // Oversized responses are fine; only the status matters.
    await response.body?.cancel().catch(() => {});
  }
  return { status: response.status, body: text, durationMs: Date.now() - started };
}
