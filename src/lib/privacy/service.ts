import { and, asc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { conversation, conversationRating, customer, message, product, webhookDelivery, webhookEndpoint } from "@/db/schema";

/** Everything Supo stores about a customer across the workspace (GDPR access request). */
export async function exportCustomerData(organizationId: string, customerId: string) {
  const cust = await db.query.customer.findFirst({
    where: and(eq(customer.id, customerId), eq(customer.organizationId, organizationId)),
  });
  if (!cust) return null;
  const conversations = await db
    .select({
      id: conversation.id,
      productId: conversation.productId,
      productName: product.name,
      channel: conversation.channel,
      subject: conversation.subject,
      status: conversation.status,
      followUpEmail: conversation.followUpEmail,
      createdAt: conversation.createdAt,
      resolvedAt: conversation.resolvedAt,
    })
    .from(conversation)
    .innerJoin(product, eq(product.id, conversation.productId))
    .where(eq(conversation.customerId, cust.id))
    .orderBy(asc(conversation.createdAt));
  const ids = conversations.map((c) => c.id);
  const [messages, ratings] = ids.length
    ? await Promise.all([
        db
          .select({
            conversationId: message.conversationId,
            senderType: message.senderType,
            body: message.body,
            createdAt: message.createdAt,
          })
          .from(message)
          .where(inArray(message.conversationId, ids))
          .orderBy(asc(message.seq)),
        db
          .select({
            conversationId: conversationRating.conversationId,
            score: conversationRating.score,
            comment: conversationRating.comment,
            createdAt: conversationRating.createdAt,
          })
          .from(conversationRating)
          .where(inArray(conversationRating.conversationId, ids)),
      ])
    : [[], []];

  return {
    exportedAt: new Date().toISOString(),
    customer: {
      id: cust.id,
      externalId: cust.externalId,
      name: cust.name,
      email: cust.email,
      avatarUrl: cust.avatarUrl,
      locale: cust.locale,
      timezone: cust.timezone,
      lastSeenAt: cust.lastSeenAt?.toISOString() ?? null,
      createdAt: cust.createdAt.toISOString(),
    },
    conversations: conversations.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
      messages: messages
        .filter((m) => m.conversationId === c.id)
        .map((m) => ({ from: m.senderType, body: m.body, createdAt: m.createdAt.toISOString() })),
      rating: ratings
        .filter((r) => r.conversationId === c.id)
        .map((r) => ({ score: r.score, comment: r.comment, createdAt: r.createdAt.toISOString() }))[0] ?? null,
    })),
  };
}

/** Deletes webhook delivery logs that embed these conversations (they contain message text). */
async function deleteDeliveryLogs(organizationId: string, conversationIds: string[]) {
  if (conversationIds.length === 0) return;
  const endpoints = db
    .select({ id: webhookEndpoint.id })
    .from(webhookEndpoint)
    .innerJoin(product, eq(product.id, webhookEndpoint.productId))
    .where(eq(product.organizationId, organizationId));
  await db.delete(webhookDelivery).where(
    and(
      inArray(webhookDelivery.endpointId, endpoints),
      or(
        inArray(sql`${webhookDelivery.payload} -> 'data' -> 'conversation' ->> 'id'`, conversationIds),
        inArray(sql`${webhookDelivery.payload} -> 'data' -> 'message' ->> 'conversationId'`, conversationIds),
      ),
    ),
  );
}

/**
 * Right to erasure: deletes the customer, their conversations, messages and
 * ratings in every product of the workspace, and webhook logs that copied them.
 */
export async function eraseCustomer(organizationId: string, customerId: string): Promise<{ conversations: number } | null> {
  const cust = await db.query.customer.findFirst({
    where: and(eq(customer.id, customerId), eq(customer.organizationId, organizationId)),
    columns: { id: true },
  });
  if (!cust) return null;
  const rows = await db.select({ id: conversation.id }).from(conversation).where(eq(conversation.customerId, cust.id));
  const ids = rows.map((r) => r.id);
  await deleteDeliveryLogs(organizationId, ids);
  await db.transaction(async (tx) => {
    if (ids.length) await tx.delete(conversation).where(inArray(conversation.id, ids)); // cascades messages and ratings
    await tx.delete(customer).where(eq(customer.id, cust.id));
  });
  return { conversations: ids.length };
}

const BATCH = 500;
const WEBHOOK_LOG_DAYS = 30;

/**
 * Applies each product's retention period to resolved conversations, removes
 * customers left with no conversations, and trims webhook delivery logs.
 */
export async function applyRetention(now = new Date()): Promise<{ conversations: number; customers: number; deliveries: number }> {
  let conversationsDeleted = 0;
  let customersDeleted = 0;
  const products = await db
    .select({ id: product.id, organizationId: product.organizationId, days: product.dataRetentionDays })
    .from(product)
    .where(isNotNull(product.dataRetentionDays));

  for (const p of products) {
    if (!p.days || p.days < 1) continue;
    const cutoff = new Date(now.getTime() - p.days * 24 * 60 * 60 * 1000);
    const expired = await db
      .select({ id: conversation.id, customerId: conversation.customerId })
      .from(conversation)
      .where(and(eq(conversation.productId, p.id), eq(conversation.status, "resolved"), lt(conversation.lastMessageAt, cutoff)))
      .limit(BATCH);
    if (expired.length === 0) continue;
    const ids = expired.map((c) => c.id);
    await deleteDeliveryLogs(p.organizationId, ids);
    await db.delete(conversation).where(inArray(conversation.id, ids));
    conversationsDeleted += ids.length;

    const candidates = [...new Set(expired.map((c) => c.customerId))];
    const orphans = await db
      .delete(customer)
      .where(
        and(
          inArray(customer.id, candidates),
          lt(customer.updatedAt, cutoff),
          sql`NOT EXISTS (SELECT 1 FROM ${conversation} WHERE ${conversation.customerId} = ${customer.id})`,
        ),
      )
      .returning({ id: customer.id });
    customersDeleted += orphans.length;
  }

  const deliveries = await db
    .delete(webhookDelivery)
    .where(lt(webhookDelivery.createdAt, new Date(now.getTime() - WEBHOOK_LOG_DAYS * 24 * 60 * 60 * 1000)))
    .returning({ id: webhookDelivery.id });
  return { conversations: conversationsDeleted, customers: customersDeleted, deliveries: deliveries.length };
}
