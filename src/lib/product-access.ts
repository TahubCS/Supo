import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, product, productMember } from "@/db/schema";
import { auth } from "@/lib/auth";

export const PRODUCT_ROLES = ["admin", "developer", "agent"] as const;
export type ProductRole = (typeof PRODUCT_ROLES)[number];

export type ProductAccess = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  membership: typeof member.$inferSelect;
  product: typeof product.$inferSelect;
  role: ProductRole;
  isWorkspaceOwner: boolean;
};

const roleCapabilities: Record<ProductRole, Set<string>> = {
  admin: new Set([
    "analytics",
    "developerDocs",
    "helpCenter",
    "inbox",
    "inboxSettings",
    "knowledge",
    "team",
    "userActivity",
    "widget",
  ]),
  developer: new Set([
    "developerDocs",
    "helpCenter",
    "inbox",
    "inboxSettings",
    "knowledge",
    "userActivity",
    "widget",
  ]),
  agent: new Set(["inbox", "userActivity"]),
};

export function isProductRole(value: string | null | undefined): value is ProductRole {
  return PRODUCT_ROLES.includes(value as ProductRole);
}

export function isWorkspaceOwnerRole(role: string | null | undefined): boolean {
  return role === "owner";
}

export function canAccessProductCapability(role: ProductRole, capability: string): boolean {
  return roleCapabilities[role].has(capability);
}

export async function getProductAccess(productId: string): Promise<ProductAccess | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!foundProduct) return null;

  const orgMembership = await db.query.member.findFirst({
    where: and(
      eq(member.userId, session.user.id),
      eq(member.organizationId, foundProduct.organizationId),
    ),
  });
  if (!orgMembership) return null;

  const assigned = await db.query.productMember.findFirst({
    where: and(
      eq(productMember.productId, productId),
      eq(productMember.userId, session.user.id),
    ),
  });
  const isWorkspaceOwner = isWorkspaceOwnerRole(orgMembership.role);
  // Workspace owners are always product admins (an explicit lower product role
  // must not lock an owner out of their own product). Workspace admins default
  // to product admin unless they were explicitly assigned a product role.
  const role: ProductRole | null = isWorkspaceOwner
    ? "admin"
    : isProductRole(assigned?.role)
      ? assigned.role
      : orgMembership.role === "admin"
        ? "admin"
        : null;

  if (!role) return null;

  return {
    session,
    membership: orgMembership,
    product: foundProduct,
    role,
    isWorkspaceOwner,
  };
}

export async function requireProductAccess(
  productId: string,
  capabilities: string[],
): Promise<ProductAccess> {
  const access = await getProductAccess(productId);
  if (!access) throw new Error("Not found");

  if (!capabilities.some((capability) => canAccessProductCapability(access.role, capability))) {
    throw new Error("Forbidden");
  }

  return access;
}
