import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { webhookDelivery, webhookEndpoint } from "@/db/schema";
import { enqueueAndKick } from "@/lib/jobs/queue";
import { safePost, SafeFetchError } from "@/lib/net/safe-fetch";

import type { WebhookEvent } from "./events";
import { SIGNATURE_HEADER, signWebhook } from "./sign";

export const WEBHOOK_JOB_TYPE = "webhook.deliver";
export const WEBHOOK_MAX_ATTEMPTS = 6; // ~5 hours with the queue's backoff
// Endpoints are switched off after this many deliveries in a row failed for good.
export const DISABLE_AFTER_FAILURES = 15;

export type WebhookPayload = {
  id: string;
  type: WebhookEvent | "ping";
  createdAt: string;
  productId: string;
  data: Record<string, unknown>;
};

async function queueDelivery(endpointId: string, payload: WebhookPayload): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(webhookDelivery).values({
    id,
    endpointId,
    event: payload.type,
    payload,
    status: "pending",
    createdAt: new Date(),
  });
  await enqueueAndKick(WEBHOOK_JOB_TYPE, { deliveryId: id }, { dedupeKey: `${WEBHOOK_JOB_TYPE}:${id}`, maxAttempts: WEBHOOK_MAX_ATTEMPTS });
  return id;
}

/**
 * Queues `type` for every enabled endpoint of the product subscribed to it.
 * Never throws: webhooks must not break the action that triggered them.
 */
export async function emitWebhookEvent(productId: string, type: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const endpoints = await db
      .select({ id: webhookEndpoint.id })
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.productId, productId),
          eq(webhookEndpoint.enabled, true),
          sql`${type} = ANY(${webhookEndpoint.events})`,
        ),
      );
    if (endpoints.length === 0) return;
    const payload: WebhookPayload = {
      id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
      type,
      createdAt: new Date().toISOString(),
      productId,
      data,
    };
    await Promise.all(endpoints.map((endpoint) => queueDelivery(endpoint.id, payload)));
  } catch (error) {
    console.error(`[webhooks] could not queue ${type}`, error);
  }
}

/** Sends a `ping` event to one endpoint (the "Send test" button). */
export async function sendTestWebhook(endpointId: string, productId: string): Promise<string> {
  return queueDelivery(endpointId, {
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    type: "ping",
    createdAt: new Date().toISOString(),
    productId,
    data: { message: "This is a test event from Supo." },
  });
}

/** Re-sends a past delivery's payload as a new delivery. */
export async function redeliverWebhook(deliveryId: string): Promise<string | null> {
  const previous = await db.query.webhookDelivery.findFirst({ where: eq(webhookDelivery.id, deliveryId) });
  if (!previous) return null;
  return queueDelivery(previous.endpointId, previous.payload as WebhookPayload);
}

/** Job handler: one delivery attempt. Throws to let the queue retry with backoff. */
export async function deliverWebhook(deliveryId: string, { isFinalAttempt }: { isFinalAttempt: boolean }): Promise<void> {
  const delivery = await db.query.webhookDelivery.findFirst({ where: eq(webhookDelivery.id, deliveryId) });
  if (!delivery || delivery.status === "success") return;
  const endpoint = await db.query.webhookEndpoint.findFirst({ where: eq(webhookEndpoint.id, delivery.endpointId) });
  if (!endpoint || !endpoint.enabled) {
    await db
      .update(webhookDelivery)
      .set({ status: "failed", error: "Endpoint is disabled" })
      .where(eq(webhookDelivery.id, deliveryId));
    return;
  }

  const body = JSON.stringify(delivery.payload);
  let status: number | null = null;
  let responseBody: string | null = null;
  let durationMs: number | null = null;
  let error: string | null = null;
  try {
    const result = await safePost(endpoint.url, {
      body,
      headers: {
        [SIGNATURE_HEADER]: signWebhook(endpoint.secret, body),
        "Supo-Event": delivery.event,
        "Supo-Delivery": delivery.id,
      },
    });
    status = result.status;
    responseBody = result.body.slice(0, 1000);
    durationMs = result.durationMs;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (caught) {
    error = caught instanceof SafeFetchError ? caught.message : "Delivery failed";
  }

  const ok = !error;
  await db
    .update(webhookDelivery)
    .set({
      status: ok ? "success" : isFinalAttempt ? "failed" : "pending",
      attempts: sql`${webhookDelivery.attempts} + 1`,
      responseStatus: status,
      responseBody,
      durationMs,
      error,
      deliveredAt: ok ? new Date() : null,
    })
    .where(eq(webhookDelivery.id, deliveryId));

  if (ok) {
    if (endpoint.consecutiveFailures > 0) {
      await db.update(webhookEndpoint).set({ consecutiveFailures: 0 }).where(eq(webhookEndpoint.id, endpoint.id));
    }
    return;
  }
  if (isFinalAttempt) {
    const [updated] = await db
      .update(webhookEndpoint)
      .set({ consecutiveFailures: sql`${webhookEndpoint.consecutiveFailures} + 1`, updatedAt: new Date() })
      .where(eq(webhookEndpoint.id, endpoint.id))
      .returning({ failures: webhookEndpoint.consecutiveFailures });
    if (updated && updated.failures >= DISABLE_AFTER_FAILURES) {
      await db
        .update(webhookEndpoint)
        .set({ enabled: false, disabledReason: `Disabled after ${updated.failures} failed deliveries in a row` })
        .where(eq(webhookEndpoint.id, endpoint.id));
    }
  }
  throw new Error(`Webhook delivery failed: ${error}`);
}

// ── Payload helpers ─────────────────────────────────────────────────────────

type ConversationRow = typeof import("@/db/schema").conversation.$inferSelect;

export function conversationData(conv: ConversationRow, customer?: { id: string; name: string; email: string | null; externalId: string | null } | null) {
  return {
    id: conv.id,
    status: conv.status,
    priority: conv.priority,
    tags: conv.tags,
    channel: conv.channel,
    subject: conv.subject,
    escalationStatus: conv.escalationStatus,
    assigneeId: conv.assigneeId,
    handoffReason: conv.handoffReason,
    customerId: conv.customerId,
    customer: customer ?? undefined,
    createdAt: conv.createdAt.toISOString(),
    escalatedAt: conv.escalatedAt?.toISOString() ?? null,
    firstResponseAt: conv.firstResponseAt?.toISOString() ?? null,
    resolvedAt: conv.resolvedAt?.toISOString() ?? null,
  };
}

/** Loads the conversation (and customer) and emits `type` with it as `data.conversation`. */
export async function emitConversationEvent(
  type: WebhookEvent,
  conversationId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const conv = await db.query.conversation.findFirst({
      where: (c, { eq: equals }) => equals(c.id, conversationId),
      with: { customer: { columns: { id: true, name: true, email: true, externalId: true } } },
    });
    if (!conv) return;
    await emitWebhookEvent(conv.productId, type, { conversation: conversationData(conv, conv.customer), ...extra });
  } catch (error) {
    console.error(`[webhooks] could not emit ${type}`, error);
  }
}

export function messageData(msg: {
  id: string;
  conversationId: string;
  senderType: string;
  body: string;
  senderId?: string | null;
  createdAt: Date | string;
}) {
  return {
    message: {
      id: msg.id,
      conversationId: msg.conversationId,
      senderType: msg.senderType,
      senderId: msg.senderId ?? null,
      body: msg.body,
      createdAt: typeof msg.createdAt === "string" ? msg.createdAt : msg.createdAt.toISOString(),
    },
  };
}
