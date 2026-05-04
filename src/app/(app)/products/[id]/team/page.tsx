import { asc, eq } from "drizzle-orm";
import { Shield, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { productInvitation, productMember } from "@/db/schema";
import { getProductAccess, isProductRole, isWorkspaceOwnerRole } from "@/lib/product-access";

import {
  PendingInviteActions,
  ProductMemberRoleSelect,
  ProductRoleForm,
  RemoveProductMemberButton,
} from "./ProductTeamForm";

export default async function ProductTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !isWorkspaceOwnerRole(access.membership.role)) {
    notFound();
  }

  const [members, invitations] = await Promise.all([
    db.query.productMember.findMany({
      where: eq(productMember.productId, id),
      with: { user: { columns: { id: true, name: true, email: true } } },
      orderBy: [asc(productMember.createdAt)],
    }),
    db.query.productInvitation.findMany({
      where: eq(productInvitation.productId, id),
      orderBy: [asc(productInvitation.createdAt)],
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Product team
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Assign product-level roles without changing global Supo admin access. Only
          workspace owners can manage product roles. Existing org members get access
          immediately; other emails are accepted automatically after that user signs in.
        </p>
      </div>

      <ProductRoleForm productId={id} />

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Shield className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Assigned members</h2>
        </div>
        <div className="divide-y divide-border">
          {members.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[color:var(--text-secondary)]">
              No product members assigned yet.
            </div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.user.name}
                  </p>
                  <p className="truncate text-xs text-[color:var(--text-secondary)]">
                    {member.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isProductRole(member.role) ? (
                    <ProductMemberRoleSelect
                      productId={id}
                      userId={member.userId}
                      currentRole={member.role}
                      disabled={member.userId === access.session.user.id}
                    />
                  ) : (
                    <Badge variant="outline" className="rounded-full text-xs">
                      {member.role}
                    </Badge>
                  )}
                  {member.userId !== access.session.user.id && (
                    <RemoveProductMemberButton productId={id} userId={member.userId} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <UserPlus className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Invitations</h2>
        </div>
        <div className="divide-y divide-border">
          {invitations.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[color:var(--text-secondary)]">
              No product invitations.
            </div>
          ) : (
            invitations.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {invite.email}
                  </p>
                  <p className="text-xs text-[color:var(--text-secondary)]">
                    Expires {invite.expiresAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full text-xs">
                    {invite.role}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full text-xs text-[color:var(--text-secondary)]"
                  >
                    {invite.status}
                  </Badge>
                  <PendingInviteActions
                    productId={id}
                    invitationId={invite.id}
                    status={invite.status}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
