import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";

import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { SUPER_ADMIN_EMAILS, isSuperAdminUserId } from "@/lib/admin";
import { env } from "@/lib/env";

type SecuritySeverity = "low" | "medium" | "high" | "critical";
type QuotaName =
  | "chat.product.hour"
  | "chat.product.day"
  | "chat.customer.hour"
  | "chat.customer.day"
  | "chat.conversation.minute"
  | "knowledge.test.user.hour"
  | "knowledge.test.product.day"
  | "knowledge.source.user.day"
  | "knowledge.source.organization.day"
  | "inbox.agent.user.hour";

type QuotaConfig = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

type SecurityEventInput = {
  userId?: string | null;
  organizationId?: string | null;
  productId?: string | null;
  eventType: string;
  severity: SecuritySeverity;
  headerList?: Headers;
  path?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown>;
};

const isProduction = process.env.NODE_ENV === "production";
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;
const resend = new Resend(env.RESEND_API_KEY);
const quotaConfigs: Record<QuotaName, QuotaConfig> = {
  "chat.product.hour": { limit: 120, window: "1 h" },
  "chat.product.day": { limit: 1000, window: "1 d" },
  "chat.customer.hour": { limit: 30, window: "1 h" },
  "chat.customer.day": { limit: 100, window: "1 d" },
  "chat.conversation.minute": { limit: 20, window: "1 m" },
  "knowledge.test.user.hour": { limit: 60, window: "1 h" },
  "knowledge.test.product.day": { limit: 300, window: "1 d" },
  "knowledge.source.user.day": { limit: 20, window: "1 d" },
  "knowledge.source.organization.day": { limit: 50, window: "1 d" },
  "inbox.agent.user.hour": { limit: 120, window: "1 h" },
};
const quotaLimiters = new Map<QuotaName, Ratelimit>();

// Keep normalized quota keys conservatively short so the final Redis keys,
// including rate-limit prefixes, stay predictable even with user identifiers.
const MAX_QUOTA_KEY_LENGTH = 180;
const SECURITY_ALERT_FROM = env.SECURITY_ALERT_FROM_EMAIL ?? "Supo <onboarding@resend.dev>";

export class SecurityQuotaError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status = 429, retryAfter?: number) {
    super(message);
    this.name = "SecurityQuotaError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function getSecurityIp(headerList: Headers): string {
  return (
    headerList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function isSecurityQuotaError(error: unknown): error is SecurityQuotaError {
  return error instanceof SecurityQuotaError;
}

export function retryAfterSeconds(resetMs?: number): number | undefined {
  if (!resetMs) return undefined;
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

export function safeQuotaKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:@-]/g, "_")
    .slice(0, MAX_QUOTA_KEY_LENGTH);
}

function quotaLimiter(name: QuotaName): Ratelimit {
  const existing = quotaLimiters.get(name);
  if (existing) return existing;

  if (!redis) {
    throw new SecurityQuotaError("Rate limiting is not configured.", 503);
  }

  const config = quotaConfigs[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(config.limit, config.window),
    prefix: `rl:${name}`,
  });
  quotaLimiters.set(name, limiter);
  return limiter;
}

export async function requireSecurityQuota(
  name: QuotaName,
  identifier: string,
  event?: Omit<SecurityEventInput, "eventType" | "severity">,
): Promise<void> {
  if (!redis && !isProduction) return;

  const config = quotaConfigs[name];
  try {
    const result = await quotaLimiter(name).limit(safeQuotaKey(identifier));
    if (result.success) return;

    await logSecurityEvent({
      ...event,
      eventType: `quota.${name}`,
      severity: "medium",
      metadata: {
        ...event?.metadata,
        limit: config.limit,
        window: config.window,
        identifier: safeQuotaKey(identifier),
      },
    });

    throw new SecurityQuotaError(
      "Too many requests. Please try again later.",
      429,
      retryAfterSeconds(result.reset),
    );
  } catch (error) {
    if (isSecurityQuotaError(error)) throw error;
    if (isProduction) {
      throw new SecurityQuotaError("Rate limiting is unavailable.", 503);
    }
  }
}

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    await db.insert(securityEvent).values({
      id: crypto.randomUUID(),
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      productId: input.productId ?? null,
      eventType: input.eventType,
      severity: input.severity,
      ipAddress: input.headerList ? getSecurityIp(input.headerList) : null,
      userAgent: input.headerList?.get("user-agent") ?? null,
      path: input.path ?? null,
      method: input.method ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Security telemetry must never crash the user flow.
  }
}

async function setDedupeKey(key: string, seconds: number): Promise<boolean> {
  if (!redis) return false;
  try {
    return (await redis.set(key, "1", { nx: true, ex: seconds })) !== null;
  } catch {
    return false;
  }
}

export async function recordSessionFingerprint(input: {
  userId: string;
  email: string;
  name: string;
  headerList: Headers;
  path?: string;
  method?: string;
}): Promise<void> {
  try {
    const ip = getSecurityIp(input.headerList);
    const userAgent = input.headerList.get("user-agent") ?? "unknown";
    const fingerprint = safeQuotaKey(`${input.userId}:${ip}:${userAgent}`);
    const isNew = await setDedupeKey(`sec:session-fp:${fingerprint}`, 60 * 60 * 24 * 7);
    if (!isNew) return;

    const isOwner = isSuperAdminUserId(input.userId);
    await logSecurityEvent({
      userId: input.userId,
      eventType: "session.new_fingerprint",
      severity: isOwner ? "high" : "low",
      headerList: input.headerList,
      path: input.path,
      method: input.method,
      metadata: { email: input.email, name: input.name },
    });

    if (!isOwner) return;

    const alertKey = `sec:owner-alert:${fingerprint}`;
    const shouldSend = await setDedupeKey(alertKey, 60 * 60 * 24 * 7);
    if (!shouldSend) return;

    await resend.emails.send({
      from: SECURITY_ALERT_FROM,
      to: SUPER_ADMIN_EMAILS,
      subject: "Supo admin sign-in from a new device",
      text: [
        "A Supo super-admin session was seen from a new IP/user-agent combination.",
        "",
        `User: ${input.name} (${input.email})`,
        `IP: ${ip}`,
        `User agent: ${userAgent}`,
        "",
        "If this was not you, revoke sessions from the Supo admin page immediately.",
      ].join("\n"),
    });
  } catch {
    // Suspicious-session telemetry must never block login or app rendering.
  }
}
