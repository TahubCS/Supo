import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { customer } from "@/db/schema";
import { isValidCustomerEmail } from "@/lib/widget-customer";

import { ApiInputError, optionalString } from "./http";

export type CustomerRow = typeof customer.$inferSelect;

export function serializeCustomer(row: CustomerRow) {
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    locale: row.locale,
    timezone: row.timezone,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CustomerFields = {
  externalId?: string;
  email?: string | null;
  name?: string;
  avatarUrl?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

export function parseCustomerFields(body: Record<string, unknown>): CustomerFields {
  const fields: CustomerFields = {};
  const externalId = optionalString(body, "externalId", 200)?.trim();
  if (externalId) fields.externalId = externalId;
  if (body.email !== undefined) {
    const email = body.email === null ? null : optionalString(body, "email", 320)?.trim().toLowerCase();
    if (email && !isValidCustomerEmail(email)) throw new ApiInputError("email is not a valid address");
    fields.email = email || null;
  }
  const name = optionalString(body, "name", 200)?.trim();
  if (name) fields.name = name;
  for (const key of ["avatarUrl", "locale", "timezone"] as const) {
    if (body[key] === null) fields[key] = null;
    else {
      const value = optionalString(body, key, key === "avatarUrl" ? 2000 : 64)?.trim();
      if (value) fields[key] = value;
    }
  }
  if (fields.avatarUrl && !/^https:\/\//i.test(fields.avatarUrl)) throw new ApiInputError("avatarUrl must be an https URL");
  return fields;
}

export async function findCustomer(organizationId: string, customerId: string) {
  return db.query.customer.findFirst({
    where: and(eq(customer.id, customerId), eq(customer.organizationId, organizationId)),
  });
}

/** Creates or updates a customer, matched by externalId, then by email. */
export async function upsertCustomer(organizationId: string, fields: CustomerFields): Promise<{ row: CustomerRow; created: boolean }> {
  if (!fields.externalId && !fields.email) throw new ApiInputError("externalId or email is required");
  const existing =
    (fields.externalId
      ? await db.query.customer.findFirst({
          where: and(eq(customer.organizationId, organizationId), eq(customer.externalId, fields.externalId)),
        })
      : undefined) ??
    (fields.email
      ? await db.query.customer.findFirst({
          where: and(eq(customer.organizationId, organizationId), eq(customer.email, fields.email)),
        })
      : undefined);
  const now = new Date();
  if (existing) {
    if (fields.externalId && existing.externalId && existing.externalId !== fields.externalId) {
      throw new ApiInputError("A customer with this email already has a different externalId");
    }
    const [row] = await db
      .update(customer)
      .set({ ...fields, updatedAt: now })
      .where(eq(customer.id, existing.id))
      .returning();
    return { row, created: false };
  }
  const [row] = await db
    .insert(customer)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      externalId: fields.externalId ?? null,
      name: fields.name ?? fields.email?.split("@")[0] ?? "Customer",
      email: fields.email ?? null,
      avatarUrl: fields.avatarUrl ?? null,
      locale: fields.locale ?? null,
      timezone: fields.timezone ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { row, created: true };
}
