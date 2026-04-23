import { eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CreateWorkspaceForm } from "@/app/dashboard/CreateWorkspaceForm";
import { SignOutButton } from "@/app/dashboard/SignOutButton";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamName?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  const { teamName } = await searchParams;

  const userOrgs = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  if (userOrgs.length === 0) {
    const defaultName =
      teamName ??
      `${session.user.name.split(" ")[0] || "My"}'s workspace`;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <CreateWorkspaceForm defaultName={defaultName} isTeam={!!teamName} />
        </div>
      </div>
    );
  }

  const activeOrg = userOrgs[0];
  const emailVerified = session.user.emailVerified;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-foreground">
              <MessageCircle className="size-4 text-background" />
            </div>
            <span className="text-base font-semibold text-foreground">Supo</span>
            <span className="text-sm text-[color:var(--text-tertiary)]">/</span>
            <span className="text-sm text-[color:var(--text-secondary)]">
              {activeOrg.name}
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      {!emailVerified ? (
        <div className="border-b border-border bg-[color:var(--card-elevated)] px-6 py-3">
          <p className="mx-auto max-w-7xl text-sm text-[color:var(--text-secondary)]">
            Please verify your email address.{" "}
            <a
              href={`/verify-email?email=${encodeURIComponent(session.user.email)}`}
              className="text-foreground hover:underline"
            >
              Resend verification email
            </a>
          </p>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-6 py-16">
        <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
          Welcome
        </p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Hi {session.user.name.split(" ")[0] || session.user.name}
        </h1>
        <p className="mb-12 max-w-xl text-base leading-relaxed text-[color:var(--text-secondary)]">
          Your workspace is ready. Product surfaces (inbox, knowledge, analytics)
          will land here as they ship.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-[color:var(--text-secondary)]">
              Signed in as
            </p>
            <p className="mt-1 text-base text-foreground">
              {session.user.email}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-[color:var(--text-secondary)]">
              Workspace
            </p>
            <p className="mt-1 text-base text-foreground">{activeOrg.name}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-[color:var(--text-secondary)]">Role</p>
            <p className="mt-1 text-base text-foreground">{activeOrg.role}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
