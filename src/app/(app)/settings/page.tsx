import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      name: user.name,
      email: user.email,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  const activeOrg = members[0];

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
        Settings
      </p>
      <h1 className="mb-10 text-3xl font-bold tracking-tight text-foreground">
        Workspace settings
      </h1>

      <div className="max-w-2xl space-y-6">
        {/* Account section */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-medium text-foreground">Account</h2>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm text-[color:var(--text-secondary)]">Name</p>
                <p className="mt-0.5 text-sm text-foreground">
                  {session.user.name}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm text-[color:var(--text-secondary)]">Email</p>
                <p className="mt-0.5 text-sm text-foreground">
                  {session.user.email}
                </p>
              </div>
              {!session.user.emailVerified ? (
                <span className="rounded border border-border bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
                  Unverified
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Team section */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-medium text-foreground">Team</h2>
          </div>
          <div className="px-6 py-4">
            {activeOrg ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{session.user.name}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--text-tertiary)]">
                    {session.user.email}
                  </p>
                </div>
                <span className="rounded border border-border bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs capitalize text-[color:var(--text-secondary)]">
                  {activeOrg.role}
                </span>
              </div>
            ) : null}
            <p className="mt-4 text-xs text-[color:var(--text-tertiary)]">
              Inviting team members is coming soon.
            </p>
          </div>
        </div>

        {/* Billing placeholder */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-medium text-foreground">Billing</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-[color:var(--text-secondary)]">
              You are on the{" "}
              <span className="text-foreground">Starter</span> plan.
            </p>
            <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">
              Plan management is coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
