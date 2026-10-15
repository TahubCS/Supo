import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { businessHours, conversation, slaPolicy } from "@/db/schema";

import { addBusinessMinutes, DEFAULT_SCHEDULE, normalizeSchedule, type BusinessHoursConfig } from "./hours";
import { SLA_WARNING_LEAD_MS } from "./state";

export { SLA_WARNING_LEAD_MS };

export async function getBusinessHours(productId: string): Promise<BusinessHoursConfig> {
  const row = await db.query.businessHours.findFirst({ where: eq(businessHours.productId, productId) });
  if (!row) return { enabled: false, timezone: "UTC", schedule: DEFAULT_SCHEDULE, holidays: [] };
  return {
    enabled: row.enabled,
    timezone: row.timezone,
    schedule: normalizeSchedule(row.schedule),
    holidays: row.holidays,
  };
}

export type SlaTargets = { firstResponseDueAt: Date | null; resolutionDueAt: Date | null };

export async function computeSlaTargets(productId: string, priority: string, from: Date): Promise<SlaTargets> {
  const policy = await db.query.slaPolicy.findFirst({
    where: and(eq(slaPolicy.productId, productId), eq(slaPolicy.priority, priority)),
  });
  if (!policy) return { firstResponseDueAt: null, resolutionDueAt: null };
  const hours = await getBusinessHours(productId);
  return {
    firstResponseDueAt: addBusinessMinutes(from, policy.firstResponseMinutes, hours),
    resolutionDueAt: policy.resolutionMinutes ? addBusinessMinutes(from, policy.resolutionMinutes, hours) : null,
  };
}

/** (Re)computes SLA due dates for an escalated conversation. */
export async function applySlaTargets(conversationId: string): Promise<SlaTargets | null> {
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    columns: { productId: true, priority: true, escalatedAt: true },
  });
  if (!conv?.escalatedAt) return null;
  const targets = await computeSlaTargets(conv.productId, conv.priority, conv.escalatedAt);
  await db
    .update(conversation)
    .set({ ...targets, slaWarningSentAt: null })
    .where(eq(conversation.id, conversationId));
  return targets;
}

/** Conversations whose first-response SLA is about to breach (or has) and nobody was warned yet. */
export async function findSlaWarnings(now = new Date()) {
  return db.query.conversation.findMany({
    where: and(
      isNull(conversation.firstResponseAt),
      isNull(conversation.slaWarningSentAt),
      isNotNull(conversation.escalationStatus),
      eq(conversation.status, "open"),
      lte(conversation.firstResponseDueAt, new Date(now.getTime() + SLA_WARNING_LEAD_MS)),
    ),
    columns: { id: true, productId: true, firstResponseDueAt: true, subject: true, priority: true, assigneeId: true },
    with: {
      product: { columns: { name: true, organizationId: true } },
      customer: { columns: { name: true } },
    },
    limit: 50,
  });
}

export { firstResponseState, type SlaState } from "./state";
