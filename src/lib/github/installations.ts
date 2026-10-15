import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { githubInstallation } from "@/db/schema";

import type { GitHubInstallationInfo } from "./app";

export type LinkedInstallation = typeof githubInstallation.$inferSelect;

/** Links verified installations to a workspace (idempotent; refreshes account details). */
export async function linkInstallations(
  organizationId: string,
  userId: string,
  installations: GitHubInstallationInfo[],
): Promise<void> {
  const now = new Date();
  for (const installation of installations) {
    const values = {
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      accountAvatarUrl: installation.account.avatarUrl,
      repositorySelection: installation.repositorySelection,
      suspendedAt: installation.suspendedAt ? new Date(installation.suspendedAt) : null,
      updatedAt: now,
    };
    await db
      .insert(githubInstallation)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        installationId: installation.id,
        createdById: userId,
        createdAt: now,
        ...values,
      })
      .onConflictDoUpdate({
        target: [githubInstallation.organizationId, githubInstallation.installationId],
        set: values,
      });
  }
}

export async function listLinkedInstallations(organizationId: string): Promise<LinkedInstallation[]> {
  return db.query.githubInstallation.findMany({
    where: eq(githubInstallation.organizationId, organizationId),
    orderBy: (i, { asc }) => [asc(i.accountLogin)],
  });
}

export async function findActiveInstallation(
  organizationId: string,
  installationId: number,
): Promise<LinkedInstallation | undefined> {
  return db.query.githubInstallation.findFirst({
    where: and(
      eq(githubInstallation.organizationId, organizationId),
      eq(githubInstallation.installationId, installationId),
      isNull(githubInstallation.suspendedAt),
    ),
  });
}

export async function unlinkInstallation(organizationId: string, installationId: number): Promise<void> {
  await db
    .delete(githubInstallation)
    .where(
      and(eq(githubInstallation.organizationId, organizationId), eq(githubInstallation.installationId, installationId)),
    );
}
