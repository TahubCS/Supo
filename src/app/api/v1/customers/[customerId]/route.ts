import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customer } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { findCustomer, parseCustomerFields, serializeCustomer } from "@/lib/api/customers";
import { ApiInputError, handleApiErrors, notFound, readJsonObject } from "@/lib/api/http";

type Params = { params: Promise<{ customerId: string }> };

/** GET /api/v1/customers/{id} */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "customers:read");
  if (!isApiContext(ctx)) return ctx;
  const row = await findCustomer(ctx.organizationId, (await params).customerId);
  if (!row) return notFound("Customer");
  return Response.json({ data: serializeCustomer(row) });
}

/** PATCH /api/v1/customers/{id}  { name?, email?, externalId?, avatarUrl?, locale?, timezone? } */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "customers:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const row = await findCustomer(ctx.organizationId, (await params).customerId);
    if (!row) return notFound("Customer");
    const fields = parseCustomerFields(await readJsonObject(req));
    if (Object.keys(fields).length === 0) throw new ApiInputError("Nothing to update");
    try {
      const [updated] = await db
        .update(customer)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(customer.id, row.id))
        .returning();
      return Response.json({ data: serializeCustomer(updated) });
    } catch (error) {
      if (error instanceof Error && /customer_org_external_id_idx|duplicate key/.test(`${error.message} ${String(error.cause)}`)) {
        throw new ApiInputError("Another customer already uses this externalId");
      }
      throw error;
    }
  } catch (error) {
    return handleApiErrors(error);
  }
}
