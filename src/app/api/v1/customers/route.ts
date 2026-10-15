import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { customer } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { parseCustomerFields, serializeCustomer, upsertCustomer } from "@/lib/api/customers";
import { decodeCursor, encodeCursor, handleApiErrors, parseLimit, readJsonObject } from "@/lib/api/http";

/**
 * GET /api/v1/customers?email=&externalId=&limit=&cursor=
 * Customers belong to the workspace and are shared by its products.
 */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "customers:read");
  if (!isApiContext(ctx)) return ctx;
  try {
    const params = new URL(req.url).searchParams;
    const limit = parseLimit(params.get("limit"));
    const cursor = decodeCursor(params.get("cursor"));
    const conditions: SQL[] = [eq(customer.organizationId, ctx.organizationId)];
    const email = params.get("email")?.trim().toLowerCase();
    const externalId = params.get("externalId")?.trim();
    if (email) conditions.push(eq(customer.email, email));
    if (externalId) conditions.push(eq(customer.externalId, externalId));
    if (cursor) {
      conditions.push(or(lt(customer.createdAt, cursor.date), and(eq(customer.createdAt, cursor.date), lt(customer.id, cursor.id)))!);
    }
    const rows = await db
      .select()
      .from(customer)
      .where(and(...conditions))
      .orderBy(desc(customer.createdAt), desc(customer.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return Response.json({
      data: page.map(serializeCustomer),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  } catch (error) {
    return handleApiErrors(error);
  }
}

/** POST /api/v1/customers  { externalId?, email?, name?, avatarUrl?, locale?, timezone? } (upsert) */
export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "customers:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const { row, created } = await upsertCustomer(ctx.organizationId, parseCustomerFields(await readJsonObject(req)));
    return Response.json({ data: serializeCustomer(row) }, { status: created ? 201 : 200 });
  } catch (error) {
    return handleApiErrors(error);
  }
}
