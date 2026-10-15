"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { businessHours, emailChannel, macro, product, slaPolicy, widgetConfig, type MacroActions } from "@/db/schema";
import { recordProductAudit } from "@/lib/audit";
import { generateAddressLocal, inboundAddress, isEmailChannelConfigured } from "@/lib/email-channel/service";
import { isValidTimeZone, normalizeSchedule } from "@/lib/sla/hours";
import { requireProductAccess } from "@/lib/product-access";

export type MacroInput = {
  title: string;
  shortcut?: string | null;
  body: string;
  actions?: MacroActions | null;
};

function normalizeMacro(input: MacroInput) {
  const title = input.title?.trim().slice(0, 80) ?? "";
  const body = input.body?.trim().slice(0, 5000) ?? "";
  const shortcut =
    input.shortcut
      ?.trim()
      .toLowerCase()
      .replace(/^\/+/, "")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 32) || null;
  if (!title) throw new Error("Title is required");
  if (!body) throw new Error("Reply text is required");

  const actions: MacroActions = {};
  if (input.actions?.status === "resolved") actions.status = "resolved";
  if (input.actions?.priority && ["low", "normal", "high", "urgent"].includes(input.actions.priority)) {
    actions.priority = input.actions.priority;
  }
  const tags = (input.actions?.addTags ?? [])
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .slice(0, 5);
  if (tags.length) actions.addTags = tags;

  return { title, body, shortcut, actions: Object.keys(actions).length ? actions : null };
}

async function requireSettings(productId: string) {
  return requireProductAccess(productId, ["inboxSettings"]);
}

function friendlyUniqueError(error: unknown): never {
  if (error instanceof Error && /macro_product_shortcut_idx|duplicate key/i.test(error.message)) {
    throw new Error("Another macro already uses that shortcut");
  }
  throw error;
}

export async function createMacro(productId: string, input: MacroInput): Promise<string> {
  const access = await requireSettings(productId);
  const values = normalizeMacro(input);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await db.insert(macro).values({
      id,
      productId,
      ...values,
      createdById: access.session.user.id,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    friendlyUniqueError(error);
  }
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "macro.created",
    targetType: "macro",
    targetId: id,
    metadata: { title: values.title },
  });
  return id;
}

export async function updateMacro(macroId: string, input: MacroInput): Promise<void> {
  const existing = await db.query.macro.findFirst({ where: eq(macro.id, macroId) });
  if (!existing) throw new Error("Not found");
  const access = await requireSettings(existing.productId);
  const values = normalizeMacro(input);
  try {
    await db
      .update(macro)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(macro.id, macroId), eq(macro.productId, existing.productId)));
  } catch (error) {
    friendlyUniqueError(error);
  }
  await recordProductAudit({
    productId: existing.productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "macro.updated",
    targetType: "macro",
    targetId: macroId,
    metadata: { title: values.title },
  });
}

export async function deleteMacro(macroId: string): Promise<void> {
  const existing = await db.query.macro.findFirst({ where: eq(macro.id, macroId) });
  if (!existing) return;
  const access = await requireSettings(existing.productId);
  await db.delete(macro).where(eq(macro.id, macroId));
  await recordProductAudit({
    productId: existing.productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "macro.deleted",
    targetType: "macro",
    targetId: macroId,
    metadata: { title: existing.title },
  });
}

export async function saveRoutingSettings(
  productId: string,
  input: { routingMode: "manual" | "round_robin"; maxConcurrentChats: number },
): Promise<void> {
  const access = await requireSettings(productId);
  const routingMode = input.routingMode === "round_robin" ? "round_robin" : "manual";
  const maxConcurrentChats = Math.max(1, Math.min(50, Math.round(Number(input.maxConcurrentChats) || 5)));
  await db.update(product).set({ routingMode, maxConcurrentChats, updatedAt: new Date() }).where(eq(product.id, productId));
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "routing.updated",
    targetType: "product",
    targetId: productId,
    metadata: { routingMode, maxConcurrentChats },
  });
}

export type BusinessHoursInput = {
  enabled: boolean;
  timezone: string;
  schedule: Record<string, { start: string; end: string }[]>;
  holidays: string[];
};

export async function saveBusinessHours(productId: string, input: BusinessHoursInput): Promise<void> {
  const access = await requireSettings(productId);
  if (!isValidTimeZone(input.timezone)) throw new Error("Unknown timezone");
  const schedule = normalizeSchedule(input.schedule);
  const holidays = [...new Set((input.holidays ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 100);
  const now = new Date();
  await db
    .insert(businessHours)
    .values({ productId, enabled: Boolean(input.enabled), timezone: input.timezone, schedule, holidays, updatedAt: now })
    .onConflictDoUpdate({
      target: businessHours.productId,
      set: { enabled: Boolean(input.enabled), timezone: input.timezone, schedule, holidays, updatedAt: now },
    });
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "business_hours.updated",
    targetType: "product",
    targetId: productId,
    metadata: { enabled: input.enabled, timezone: input.timezone },
  });
}

export type SlaPolicyInput = { priority: string; firstResponseMinutes: number | null; resolutionMinutes: number | null };

export async function saveSlaPolicies(productId: string, policies: SlaPolicyInput[]): Promise<void> {
  const access = await requireSettings(productId);
  const now = new Date();
  for (const priority of ["low", "normal", "high", "urgent"]) {
    const input = policies.find((p) => p.priority === priority);
    const first = input?.firstResponseMinutes ? Math.round(input.firstResponseMinutes) : null;
    const resolution = input?.resolutionMinutes ? Math.round(input.resolutionMinutes) : null;
    if (!first || first < 1) {
      await db.delete(slaPolicy).where(and(eq(slaPolicy.productId, productId), eq(slaPolicy.priority, priority)));
      continue;
    }
    if (first > 60 * 24 * 30 || (resolution !== null && (resolution < first || resolution > 60 * 24 * 90))) {
      throw new Error(`Invalid SLA for ${priority} priority`);
    }
    await db
      .insert(slaPolicy)
      .values({
        id: crypto.randomUUID(),
        productId,
        priority,
        firstResponseMinutes: first,
        resolutionMinutes: resolution,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [slaPolicy.productId, slaPolicy.priority],
        set: { firstResponseMinutes: first, resolutionMinutes: resolution, updatedAt: now },
      });
  }
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "sla.updated",
    targetType: "product",
    targetId: productId,
    metadata: { policies },
  });
}

export async function saveCsatEnabled(productId: string, enabled: boolean): Promise<void> {
  const access = await requireSettings(productId);
  const now = new Date();
  await db
    .insert(widgetConfig)
    .values({ id: crypto.randomUUID(), productId, csatEnabled: enabled, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: widgetConfig.productId, set: { csatEnabled: enabled, updatedAt: now } });
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: enabled ? "csat.enabled" : "csat.disabled",
    targetType: "product",
    targetId: productId,
  });
}

// ── Email channel ──────────────────────────────────────────────────────────

export async function saveEmailChannel(
  productId: string,
  input: { enabled: boolean; fromName: string },
): Promise<{ ok: true; address: string | null } | { ok: false; error: string }> {
  try {
    const access = await requireSettings(productId);
    if (!isEmailChannelConfigured()) {
      return { ok: false, error: "Set INBOUND_EMAIL_DOMAIN and RESEND_WEBHOOK_SECRET on the server first" };
    }
    const now = new Date();
    const fromName = input.fromName.trim().replace(/["<>\r\n]/g, "").slice(0, 60) || null;
    const existing = await db.query.emailChannel.findFirst({ where: eq(emailChannel.productId, productId) });
    const addressLocal = existing?.addressLocal ?? generateAddressLocal(access.product.name);
    await db
      .insert(emailChannel)
      .values({ productId, enabled: input.enabled, addressLocal, fromName, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: emailChannel.productId, set: { enabled: input.enabled, fromName, updatedAt: now } });
    await recordProductAudit({
      productId,
      actor: { id: access.session.user.id, name: access.session.user.name },
      action: "email_channel.updated",
      targetType: "email_channel",
      targetId: productId,
      metadata: { enabled: input.enabled },
    });
    return { ok: true, address: inboundAddress(addressLocal) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save" };
  }
}

// ── Data retention ─────────────────────────────────────────────────────────

export async function saveDataRetention(
  productId: string,
  days: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const access = await requireSettings(productId);
    if (access.role !== "admin") return { ok: false, error: "Only product admins can change data retention" };
    if (days !== null && (!Number.isInteger(days) || days < 7 || days > 3650)) {
      return { ok: false, error: "Retention must be between 7 and 3650 days" };
    }
    await db.update(product).set({ dataRetentionDays: days, updatedAt: new Date() }).where(eq(product.id, productId));
    await recordProductAudit({
      productId,
      actor: { id: access.session.user.id, name: access.session.user.name },
      action: "data_retention.updated",
      targetType: "product",
      targetId: productId,
      metadata: { days },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save" };
  }
}
