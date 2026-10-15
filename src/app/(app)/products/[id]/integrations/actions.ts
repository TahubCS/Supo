"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { apiKey, webhookDelivery, webhookEndpoint } from "@/db/schema";
import { generateApiKey, normalizeScopes } from "@/lib/api/keys";
import { recordProductAudit } from "@/lib/audit";
import { assertPublicUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { requireProductAccess, type ProductAccess } from "@/lib/product-access";
import { normalizeEvents } from "@/lib/webhooks/events";
import { redeliverWebhook, sendTestWebhook } from "@/lib/webhooks/service";
import { generateWebhookSecret } from "@/lib/webhooks/sign";

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { value: T })) | { ok: false; error: string };

const MAX_KEYS = 25;
const MAX_ENDPOINTS = 10;

function requireIntegrations(productId: string) {
  return requireProductAccess(productId, ["integrations"]);
}

function audit(access: ProductAccess, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  return recordProductAudit({
    productId: access.product.id,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action,
    targetType,
    targetId,
    metadata,
  });
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
const revalidate = (productId: string) => revalidatePath(`/products/${productId}/integrations`);

// ── API keys ───────────────────────────────────────────────────────────────

export async function createApiKey(
  productId: string,
  input: { name: string; scopes: string[]; expiresInDays: number | null },
): Promise<Result<{ key: string }>> {
  try {
    const access = await requireIntegrations(productId);
    const name = input.name.trim().slice(0, 80);
    if (!name) return { ok: false, error: "Name is required" };
    const scopes = normalizeScopes(input.scopes);
    if (scopes.length === 0) return { ok: false, error: "Choose at least one permission" };
    const active = await db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.productId, productId), isNull(apiKey.revokedAt)));
    if (active.length >= MAX_KEYS) return { ok: false, error: `A product can have up to ${MAX_KEYS} active keys` };
    const days = input.expiresInDays;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) {
      return { ok: false, error: "Expiry must be between 1 and 730 days" };
    }

    const { key, prefix, hash } = generateApiKey();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(apiKey).values({
      id,
      productId,
      name,
      prefix,
      keyHash: hash,
      scopes,
      createdById: access.session.user.id,
      expiresAt: days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null,
      createdAt: now,
    });
    await audit(access, "api_key.created", "api_key", id, { name, scopes, prefix });
    revalidate(productId);
    return { ok: true, value: { key } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function revokeApiKey(productId: string, keyId: string): Promise<Result> {
  try {
    const access = await requireIntegrations(productId);
    const [row] = await db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, keyId), eq(apiKey.productId, productId), isNull(apiKey.revokedAt)))
      .returning({ name: apiKey.name });
    if (!row) return { ok: false, error: "Key not found" };
    await audit(access, "api_key.revoked", "api_key", keyId, { name: row.name });
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Webhooks ───────────────────────────────────────────────────────────────

async function validateEndpointUrl(raw: string): Promise<string> {
  const value = raw.trim();
  if (!/^https:\/\//i.test(value)) throw new Error("Webhook URLs must use https://");
  try {
    return (await assertPublicUrl(value)).toString();
  } catch (error) {
    throw new Error(error instanceof SafeFetchError ? error.message : "Enter a valid URL");
  }
}

export async function createWebhookEndpoint(
  productId: string,
  input: { url: string; events: string[]; description: string },
): Promise<Result<{ secret: string }>> {
  try {
    const access = await requireIntegrations(productId);
    const url = await validateEndpointUrl(input.url);
    const events = normalizeEvents(input.events);
    if (events.length === 0) return { ok: false, error: "Choose at least one event" };
    const existing = await db.select({ id: webhookEndpoint.id }).from(webhookEndpoint).where(eq(webhookEndpoint.productId, productId));
    if (existing.length >= MAX_ENDPOINTS) return { ok: false, error: `A product can have up to ${MAX_ENDPOINTS} endpoints` };

    const id = crypto.randomUUID();
    const secret = generateWebhookSecret();
    const now = new Date();
    await db.insert(webhookEndpoint).values({
      id,
      productId,
      url,
      description: input.description.trim().slice(0, 200) || null,
      secret,
      events,
      createdById: access.session.user.id,
      createdAt: now,
      updatedAt: now,
    });
    await audit(access, "webhook.created", "webhook_endpoint", id, { url, events });
    revalidate(productId);
    return { ok: true, value: { secret } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updateWebhookEndpoint(
  productId: string,
  endpointId: string,
  input: { url?: string; events?: string[]; enabled?: boolean; description?: string },
): Promise<Result> {
  try {
    const access = await requireIntegrations(productId);
    const values: Partial<typeof webhookEndpoint.$inferInsert> = { updatedAt: new Date() };
    if (input.url !== undefined) values.url = await validateEndpointUrl(input.url);
    if (input.events !== undefined) {
      const events = normalizeEvents(input.events);
      if (events.length === 0) return { ok: false, error: "Choose at least one event" };
      values.events = events;
    }
    if (input.description !== undefined) values.description = input.description.trim().slice(0, 200) || null;
    if (input.enabled !== undefined) {
      values.enabled = input.enabled;
      // Re-enabling clears the automatic shut-off.
      if (input.enabled) Object.assign(values, { consecutiveFailures: 0, disabledReason: null });
    }
    const [row] = await db
      .update(webhookEndpoint)
      .set(values)
      .where(and(eq(webhookEndpoint.id, endpointId), eq(webhookEndpoint.productId, productId)))
      .returning({ id: webhookEndpoint.id });
    if (!row) return { ok: false, error: "Endpoint not found" };
    await audit(access, "webhook.updated", "webhook_endpoint", endpointId, { ...input });
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function rotateWebhookSecret(productId: string, endpointId: string): Promise<Result<{ secret: string }>> {
  try {
    const access = await requireIntegrations(productId);
    const secret = generateWebhookSecret();
    const [row] = await db
      .update(webhookEndpoint)
      .set({ secret, updatedAt: new Date() })
      .where(and(eq(webhookEndpoint.id, endpointId), eq(webhookEndpoint.productId, productId)))
      .returning({ id: webhookEndpoint.id });
    if (!row) return { ok: false, error: "Endpoint not found" };
    await audit(access, "webhook.secret_rotated", "webhook_endpoint", endpointId);
    return { ok: true, value: { secret } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function deleteWebhookEndpoint(productId: string, endpointId: string): Promise<Result> {
  try {
    const access = await requireIntegrations(productId);
    await db.delete(webhookEndpoint).where(and(eq(webhookEndpoint.id, endpointId), eq(webhookEndpoint.productId, productId)));
    await audit(access, "webhook.deleted", "webhook_endpoint", endpointId);
    revalidate(productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

async function requireEndpoint(productId: string, endpointId: string) {
  await requireIntegrations(productId);
  const endpoint = await db.query.webhookEndpoint.findFirst({
    where: and(eq(webhookEndpoint.id, endpointId), eq(webhookEndpoint.productId, productId)),
  });
  if (!endpoint) throw new Error("Endpoint not found");
  return endpoint;
}

export async function sendTestEvent(productId: string, endpointId: string): Promise<Result> {
  try {
    const endpoint = await requireEndpoint(productId, endpointId);
    if (!endpoint.enabled) return { ok: false, error: "Enable the endpoint first" };
    await sendTestWebhook(endpoint.id, productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export type DeliverySummary = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  payload: unknown;
  responseBody: string | null;
};

export async function listDeliveries(productId: string, endpointId: string): Promise<DeliverySummary[]> {
  const endpoint = await requireEndpoint(productId, endpointId);
  return db
    .select({
      id: webhookDelivery.id,
      event: webhookDelivery.event,
      status: webhookDelivery.status,
      attempts: webhookDelivery.attempts,
      responseStatus: webhookDelivery.responseStatus,
      error: webhookDelivery.error,
      durationMs: webhookDelivery.durationMs,
      createdAt: webhookDelivery.createdAt,
      payload: webhookDelivery.payload,
      responseBody: webhookDelivery.responseBody,
    })
    .from(webhookDelivery)
    .where(eq(webhookDelivery.endpointId, endpoint.id))
    .orderBy(desc(webhookDelivery.createdAt))
    .limit(50);
}

export async function redeliver(productId: string, endpointId: string, deliveryId: string): Promise<Result> {
  try {
    await requireEndpoint(productId, endpointId);
    const delivery = await db.query.webhookDelivery.findFirst({
      where: and(eq(webhookDelivery.id, deliveryId), eq(webhookDelivery.endpointId, endpointId)),
      columns: { id: true },
    });
    if (!delivery) return { ok: false, error: "Delivery not found" };
    await redeliverWebhook(delivery.id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
