"use server";

import { recordProductAudit } from "@/lib/audit";
import { eraseCustomer, exportCustomerData } from "@/lib/privacy/service";
import { requireProductAccess } from "@/lib/product-access";

// GDPR tools: product admins only (they act on the customer across the workspace).
async function requireAdmin(productId: string) {
  const access = await requireProductAccess(productId, ["inbox"]);
  if (access.role !== "admin") throw new Error("Only product admins can export or erase customer data");
  return access;
}

export async function exportCustomer(productId: string, customerId: string): Promise<string> {
  const access = await requireAdmin(productId);
  const data = await exportCustomerData(access.product.organizationId, customerId);
  if (!data) throw new Error("Customer not found");
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "customer.exported",
    targetType: "customer",
    targetId: customerId,
  });
  return JSON.stringify(data, null, 2);
}

export async function eraseCustomerData(productId: string, customerId: string): Promise<{ conversations: number }> {
  const access = await requireAdmin(productId);
  const result = await eraseCustomer(access.product.organizationId, customerId);
  if (!result) throw new Error("Customer not found");
  // No personal data in the audit entry: the customer no longer exists.
  await recordProductAudit({
    productId,
    actor: { id: access.session.user.id, name: access.session.user.name },
    action: "customer.erased",
    targetType: "customer",
    targetId: customerId,
    metadata: { conversations: result.conversations },
  });
  return result;
}
