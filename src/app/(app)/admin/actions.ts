"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { adminAuditLog, member, session as sessionTable, user } from "@/db/schema";
import { isSuperAdminUserId } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/admin-server";

export type AdminUserSession = {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

function getRequestIp(headerList: Headers): string | null {
  return (
    headerList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

async function getPrimaryOrganizationIdForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);

  return rows[0]?.organizationId ?? null;
}

async function writeAuditLog(input: {
  adminUserId: string;
  targetUserId?: string;
  action: string;
  metadata?: AuditMetadata;
  headerList: Headers;
}) {
  await db.insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    adminUserId: input.adminUserId,
    targetUserId: input.targetUserId,
    targetOrganizationId: input.targetUserId
      ? await getPrimaryOrganizationIdForUser(input.targetUserId)
      : null,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    ipAddress: getRequestIp(input.headerList),
    userAgent: input.headerList.get("user-agent"),
    createdAt: new Date(),
  });
}

function assertCanTargetUser(userId: string) {
  if (isSuperAdminUserId(userId)) {
    throw new Error("The configured super-admin account cannot be targeted by admin actions.");
  }
}

function serializeSession(session: {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}): AdminUserSession {
  return {
    id: session.id,
    token: session.token,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function listUserSessions(userId: string): Promise<AdminUserSession[]> {
  const session = await requireSuperAdmin();
  const headerList = await headers();

  const sessions = await db
    .select({
      id: sessionTable.id,
      token: sessionTable.token,
      ipAddress: sessionTable.ipAddress,
      userAgent: sessionTable.userAgent,
      createdAt: sessionTable.createdAt,
      updatedAt: sessionTable.updatedAt,
      expiresAt: sessionTable.expiresAt,
    })
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .orderBy(sessionTable.createdAt);

  await writeAuditLog({
    adminUserId: session.user.id,
    targetUserId: userId,
    action: "admin.list_user_sessions",
    metadata: { sessionCount: sessions.length },
    headerList,
  });

  return sessions.map(serializeSession);
}

export async function revokeUserSession(sessionToken: string, targetUserId: string): Promise<void> {
  const adminSession = await requireSuperAdmin();
  const headerList = await headers();
  assertCanTargetUser(targetUserId);
  const [targetSession] = await db
    .select({ userId: sessionTable.userId })
    .from(sessionTable)
    .where(eq(sessionTable.token, sessionToken))
    .limit(1);

  if (!targetSession || targetSession.userId !== targetUserId) {
    throw new Error("Session does not belong to the selected user.");
  }

  await db.delete(sessionTable).where(eq(sessionTable.token, sessionToken));

  await writeAuditLog({
    adminUserId: adminSession.user.id,
    targetUserId,
    action: "admin.revoke_user_session",
    metadata: { tokenPreview: sessionToken.slice(0, 8) },
    headerList,
  });

  revalidatePath("/admin");
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const session = await requireSuperAdmin();
  const headerList = await headers();
  assertCanTargetUser(userId);

  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));

  await writeAuditLog({
    adminUserId: session.user.id,
    targetUserId: userId,
    action: "admin.revoke_all_user_sessions",
    headerList,
  });

  revalidatePath("/admin");
}

export async function banUser(userId: string, reason?: string): Promise<void> {
  const session = await requireSuperAdmin();
  const headerList = await headers();
  assertCanTargetUser(userId);
  const banReason = reason?.trim() || "Admin security action";

  await db
    .update(user)
    .set({
      banned: true,
      banReason,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));

  await writeAuditLog({
    adminUserId: session.user.id,
    targetUserId: userId,
    action: "admin.ban_user",
    metadata: { reason: banReason },
    headerList,
  });

  revalidatePath("/admin");
}

export async function unbanUser(userId: string): Promise<void> {
  const session = await requireSuperAdmin();
  const headerList = await headers();
  assertCanTargetUser(userId);

  await db
    .update(user)
    .set({
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  await writeAuditLog({
    adminUserId: session.user.id,
    targetUserId: userId,
    action: "admin.unban_user",
    headerList,
  });

  revalidatePath("/admin");
}
