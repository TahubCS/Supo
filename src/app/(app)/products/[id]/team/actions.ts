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
import {
  sendProductInviteEmail,
  type ProductInviteEmailResult,
} from "@/lib/product-invite-email";

type AssignProductRoleResult = {
  kind: "assigned" | "invited";
  email: ProductInviteEmailResult;
};

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
): Promise<AssignProductRoleResult> {
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
  let kind: AssignProductRoleResult["kind"] = "invited";

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
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [productMember.productId, productMember.userId],
          set: { role, updatedAt: now },
        });
      kind = "assigned";
    } else {
      await upsertPendingInvitation(productId, email, role, access.session.user.id, now);
    }
  } else {
    await upsertPendingInvitation(productId, email, role, access.session.user.id, now);
  }

  const emailResult = await sendProductInviteEmail({
    to: email,
    inviterName: access.session.user.name,
    productName: access.product.name,
    role,
  });

  revalidatePath(`/products/${productId}/team`);
  return { kind, email: emailResult };
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
      acceptedAt: null,
      inviterId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productInvitation.productId, productInvitation.email],
      set: {
        role,
        status: "pending",
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
        acceptedAt: null,
        inviterId,
        updatedAt: now,
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

export async function updateProductMemberRole(
  productId: string,
  userId: string,
  role: ProductRole,
): Promise<void> {
  const access = await requireWorkspaceOwner(productId);
  if (!isProductRole(role)) throw new Error("Invalid product role");
  if (userId === access.session.user.id) {
    throw new Error("You cannot change your own product role");
  }

  const now = new Date();
  const existing = await db.query.productMember.findFirst({
    where: and(eq(productMember.productId, productId), eq(productMember.userId, userId)),
  });
  if (!existing) throw new Error("Product member not found");

  await db
    .update(productMember)
    .set({ role, updatedAt: now })
    .where(and(eq(productMember.productId, productId), eq(productMember.userId, userId)));

  revalidatePath(`/products/${productId}/team`);
}

export async function resendProductInvitation(
  productId: string,
  invitationId: string,
): Promise<{ email: ProductInviteEmailResult }> {
  const access = await requireWorkspaceOwner(productId);
  const invite = await db.query.productInvitation.findFirst({
    where: and(
      eq(productInvitation.id, invitationId),
      eq(productInvitation.productId, productId),
    ),
  });
  if (!invite) throw new Error("Invitation not found");
  if (invite.status === "accepted") throw new Error("Accepted invitations cannot be resent");
  if (!isProductRole(invite.role)) throw new Error("Invalid invitation role");

  const now = new Date();
  await db
    .update(productInvitation)
    .set({
      status: "pending",
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
      acceptedAt: null,
      inviterId: access.session.user.id,
      updatedAt: now,
    })
    .where(eq(productInvitation.id, invitationId));

  const email = await sendProductInviteEmail({
    to: invite.email,
    inviterName: access.session.user.name,
    productName: access.product.name,
    role: invite.role,
  });

  revalidatePath(`/products/${productId}/team`);
  return { email };
}

export async function revokeProductInvitation(
  productId: string,
  invitationId: string,
): Promise<void> {
  await requireWorkspaceOwner(productId);
  const now = new Date();
  const invite = await db.query.productInvitation.findFirst({
    where: and(
      eq(productInvitation.id, invitationId),
      eq(productInvitation.productId, productId),
    ),
  });
  if (!invite) throw new Error("Invitation not found");
  if (invite.status === "accepted") throw new Error("Accepted invitations cannot be revoked");

  await db
    .update(productInvitation)
    .set({
      status: "revoked",
      expiresAt: now,
      updatedAt: now,
    })
    .where(eq(productInvitation.id, invitationId));

  revalidatePath(`/products/${productId}/team`);
}
