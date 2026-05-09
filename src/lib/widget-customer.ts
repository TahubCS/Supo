import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { customer } from "@/db/schema";

const MAX_CUSTOMER_EXTERNAL_ID_LENGTH = 191;
const MAX_CUSTOMER_NAME_LENGTH = 120;
const MAX_CUSTOMER_EMAIL_LENGTH = 254;
const MAX_CUSTOMER_AVATAR_URL_LENGTH = 2048;
const MAX_CUSTOMER_LOCALE_LENGTH = 35;
const MAX_CUSTOMER_TIMEZONE_LENGTH = 64;

export type WidgetCustomerInput = {
  id?: unknown;
  externalId?: unknown;
  name?: unknown;
  email?: unknown;
  avatarUrl?: unknown;
  locale?: unknown;
  timezone?: unknown;
};

export type NormalizedWidgetCustomer = {
  externalId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  locale: string | null;
  timezone: string | null;
  identityKey: string;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function isValidCustomerEmail(email: string): boolean {
  if (email.length > MAX_CUSTOMER_EMAIL_LENGTH || email.includes("..")) {
    return false;
  }

  const parts = email.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64 || !/^[^\s@]+$/.test(local)) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2) return false;

  const topLevelDomain = labels.at(-1);
  if (!topLevelDomain || topLevelDomain.length < 2 || !/^[a-z]+$/i.test(topLevelDomain)) {
    return false;
  }

  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/i.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-"),
  );
}

function deriveCustomerName({
  name,
  email,
  externalId,
}: {
  name: string | null;
  email: string | null;
  externalId: string | null;
}) {
  if (name) return name;
  if (email) return email.split("@")[0].slice(0, MAX_CUSTOMER_NAME_LENGTH);
  if (externalId) return `Customer ${externalId.slice(0, 8)}`;
  return "Customer";
}

export function normalizeWidgetCustomer(input: WidgetCustomerInput | null | undefined): NormalizedWidgetCustomer | null {
  const externalId = text(input?.externalId ?? input?.id, MAX_CUSTOMER_EXTERNAL_ID_LENGTH);
  const email = text(input?.email, MAX_CUSTOMER_EMAIL_LENGTH)?.toLowerCase() ?? null;

  if (email && !isValidCustomerEmail(email)) return null;
  if (!externalId && !email) return null;

  const name = deriveCustomerName({
    name: text(input?.name, MAX_CUSTOMER_NAME_LENGTH),
    email,
    externalId,
  });
  const avatarUrl = text(input?.avatarUrl, MAX_CUSTOMER_AVATAR_URL_LENGTH);
  const locale = text(input?.locale, MAX_CUSTOMER_LOCALE_LENGTH);
  const timezone = text(input?.timezone, MAX_CUSTOMER_TIMEZONE_LENGTH);

  return {
    externalId,
    name,
    email,
    avatarUrl,
    locale,
    timezone,
    identityKey: externalId ? `external:${externalId}` : `email:${email}`,
  };
}

export async function resolveWidgetCustomer({
  organizationId,
  input,
}: {
  organizationId: string;
  input: WidgetCustomerInput | null | undefined;
}) {
  const normalized = normalizeWidgetCustomer(input);
  if (!normalized) return null;

  const now = new Date();
  const explicitName = text(input?.name, MAX_CUSTOMER_NAME_LENGTH);
  let found = normalized.externalId
    ? await db.query.customer.findFirst({
        where: and(
          eq(customer.organizationId, organizationId),
          eq(customer.externalId, normalized.externalId),
        ),
      })
    : null;

  if (!found && normalized.email) {
    found = await db.query.customer.findFirst({
      where: and(
        eq(customer.organizationId, organizationId),
        eq(customer.email, normalized.email),
      ),
    });
  }

  if (!found) {
    const id = crypto.randomUUID();
    await db.insert(customer).values({
      id,
      organizationId,
      externalId: normalized.externalId,
      name: normalized.name,
      email: normalized.email,
      avatarUrl: normalized.avatarUrl,
      locale: normalized.locale,
      timezone: normalized.timezone,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    found = {
      id,
      organizationId,
      externalId: normalized.externalId,
      name: normalized.name,
      email: normalized.email,
      avatarUrl: normalized.avatarUrl,
      locale: normalized.locale,
      timezone: normalized.timezone,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    const updates = {
      externalId: found.externalId ?? normalized.externalId,
      name: explicitName ?? found.name,
      email: normalized.email ?? found.email,
      avatarUrl: normalized.avatarUrl ?? found.avatarUrl,
      locale: normalized.locale ?? found.locale,
      timezone: normalized.timezone ?? found.timezone,
      lastSeenAt: now,
      updatedAt: now,
    };
    await db.update(customer).set(updates).where(eq(customer.id, found.id));
    found = { ...found, ...updates };
  }

  return { customer: found, normalized };
}
