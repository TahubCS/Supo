import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { notFound } from "@/lib/api/http";
import { exportCustomerData } from "@/lib/privacy/service";

/** GET /api/v1/customers/{id}/export — all data about the customer (GDPR access request). */
export async function GET(req: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const ctx = await authenticateApi(req, "customers:read");
  if (!isApiContext(ctx)) return ctx;
  const data = await exportCustomerData(ctx.organizationId, (await params).customerId);
  if (!data) return notFound("Customer");
  return Response.json({ data });
}
