import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { member, productInvitation, productMember } from "@/db/schema";
import { isProductRole } from "@/lib/product-access";

export async function acceptPendingProductInvitationsForUser({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const now = new Date();
  let pendingInvites: Array<
    typeof productInvitation.$inferSelect & {
      product: { id: string; organizationId: string };
    }
  >;

  try {
    pendingInvites = await db.query.productInvitation.findMany({
      where: and(
        eq(productInvitation.email, normalizedEmail),
        eq(productInvitation.status, "pending"),
        gt(productInvitation.expiresAt, now),
      ),
      with: { product: { columns: { id: true, organizationId: true } } },
    });
  } catch {
    // Invitation acceptance is a convenience path and must never block login.
    // This can happen locally before the product-role migration has been applied.
    return;
  }

  for (const invite of pendingInvites) {
    if (!isProductRole(invite.role)) continue;

    const orgMember = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, invite.product.organizationId),
        eq(member.userId, userId),
      ),
    });

    if (!orgMember) {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: invite.product.organizationId,
        userId,
        role: "member",
        createdAt: now,
      });
    }

    await db
      .insert(productMember)
      .values({
        id: crypto.randomUUID(),
        productId: invite.productId,
        userId,
        role: invite.role,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [productMember.productId, productMember.userId],
        set: { role: invite.role, updatedAt: now },
      });

    await db
      .update(productInvitation)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(productInvitation.id, invite.id));
  }
}
