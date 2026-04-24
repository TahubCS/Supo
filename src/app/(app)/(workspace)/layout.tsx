import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userOrgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  if (userOrgs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <CreateWorkspaceForm
            defaultName={`${session.user.name.split(" ")[0] || "My"}'s workspace`}
          />
        </div>
      </div>
    );
  }

  const activeOrg = userOrgs[0];

  return (
    <div className="flex min-h-screen bg-background">
      <WorkspaceSidebar
        userName={session.user.name}
        userEmail={session.user.email}
        orgName={activeOrg.name}
        emailVerified={session.user.emailVerified}
      />
      <main className="flex-1 overflow-auto scroll-smooth">{children}</main>
    </div>
  );
}
