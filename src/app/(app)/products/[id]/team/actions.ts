"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { member, productInvitation, productMember, user } from "@/db/schema";
import {
  isProductRole,
  isWorkspaceOwnerRole,
  requireProductAccess,
  type ProductRole,
} from "@/lib/product-access";

function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function requireWorkspaceOwner(productId: string) {
  const access = await requireProductAccess(productId, ["team"]);
  if (!isWorkspaceOwnerRole(access.membership.role)) {
    throw new Error("Only workspace owners can manage product roles");
  }
  return access;
}

export async function assignProductRole(
  productId: string,
  formData: FormData,
): Promise<void> {
  const access = await requireWorkspaceOwner(productId);
  const email = normalizeEmail(formData.get("email"));
  const roleValue = formData.get("role");
  const role = typeof roleValue === "string" && isProductRole(roleValue)
    ? roleValue
    : null;

  if (!email || !role) throw new Error("Valid email and role are required");

  const targetUser = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  const now = new Date();

  if (targetUser) {
    const orgMember = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, access.product.organizationId),
        eq(member.userId, targetUser.id),
      ),
    });

    if (orgMember) {
      await db
        .insert(productMember)
        .values({
          id: crypto.randomUUID(),
          productId,
          userId: targetUser.id,
          role,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [productMember.productId, productMember.userId],
          set: { role },
        });
    } else {
      await upsertPendingInvitation(productId, email, role, access.session.user.id, now);
    }
  } else {
    await upsertPendingInvitation(productId, email, role, access.session.user.id, now);
  }

  revalidatePath(`/products/${productId}/team`);
}

async function upsertPendingInvitation(
  productId: string,
  email: string,
  role: ProductRole,
  inviterId: string,
  now: Date,
) {
  await db
    .insert(productInvitation)
    .values({
      id: crypto.randomUUID(),
      productId,
      email,
      role,
      status: "pending",
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
      inviterId,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [productInvitation.productId, productInvitation.email],
      set: {
        role,
        status: "pending",
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
        inviterId,
      },
    });
}

export async function removeProductMember(
  productId: string,
  userId: string,
): Promise<void> {
  const access = await requireWorkspaceOwner(productId);
  if (userId === access.session.user.id) {
    throw new Error("You cannot remove your own product access");
  }

  await db
    .delete(productMember)
    .where(and(eq(productMember.productId, productId), eq(productMember.userId, userId)));

  revalidatePath(`/products/${productId}/team`);
}
