import { sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { requireSuperAdmin } from "@/lib/admin-server";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: Date;
  member_count: string;
  product_count: string;
  customer_count: string;
  conversation_count: string;
  open_conversation_count: string;
  knowledge_source_count: string;
  pending_suggestion_count: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
};

function toNumber(value: string): number {
  return Number.parseInt(value, 10) || 0;
}

export default async function AdminPage() {
  await requireSuperAdmin();

  const [workspaceResult, userResult] = await Promise.all([
    db.execute(sql`
      SELECT
        o.id,
        o.name,
        o.slug,
        o.created_at,
        COUNT(DISTINCT m.id)::text AS member_count,
        COUNT(DISTINCT p.id)::text AS product_count,
        COUNT(DISTINCT c.id)::text AS customer_count,
        COUNT(DISTINCT conv.id)::text AS conversation_count,
        COUNT(DISTINCT conv.id) FILTER (WHERE conv.status = 'open')::text AS open_conversation_count,
        COUNT(DISTINCT ks.id)::text AS knowledge_source_count,
        COUNT(DISTINCT sugg.id) FILTER (WHERE sugg.status = 'pending')::text AS pending_suggestion_count
      FROM organization o
      LEFT JOIN member m ON m.organization_id = o.id
      LEFT JOIN product p ON p.organization_id = o.id
      LEFT JOIN customer c ON c.organization_id = o.id
      LEFT JOIN conversation conv ON conv.product_id = p.id
      LEFT JOIN knowledge_source ks ON ks.product_id = p.id
      LEFT JOIN knowledge_suggestion sugg ON sugg.product_id = p.id
      GROUP BY o.id, o.name, o.slug, o.created_at
      ORDER BY o.created_at DESC
    `),
    db.execute(sql`
      SELECT id, name, email, email_verified, created_at
      FROM "user"
      ORDER BY created_at DESC
      LIMIT 20
    `),
  ]);

  const workspaces = workspaceResult.rows as WorkspaceRow[];
  const users = userResult.rows as UserRow[];
  const totals = workspaces.reduce(
    (acc, workspace) => ({
      workspaces: acc.workspaces + 1,
      products: acc.products + toNumber(workspace.product_count),
      conversations: acc.conversations + toNumber(workspace.conversation_count),
      pendingSuggestions: acc.pendingSuggestions + toNumber(workspace.pending_suggestion_count),
    }),
    { workspaces: 0, products: 0, conversations: 0, pendingSuggestions: 0 },
  );

  return (
    <div className="min-h-screen bg-background px-8 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-[color:var(--text-secondary)]">Admin</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Workspace overview
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--text-secondary)] hover:text-foreground"
        >
          Back to products
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Workspaces", totals.workspaces],
          ["Products", totals.products],
          ["Conversations", totals.conversations],
          ["Pending suggestions", totals.pendingSuggestions],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs text-[color:var(--text-secondary)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">All workspaces</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Read-only database visibility for verified Supo admin accounts.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border text-xs text-[color:var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Products</th>
                  <th className="px-4 py-3 font-medium">Customers</th>
                  <th className="px-4 py-3 font-medium">Conversations</th>
                  <th className="px-4 py-3 font-medium">Open</th>
                  <th className="px-4 py-3 font-medium">Sources</th>
                  <th className="px-4 py-3 font-medium">Pending KB</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{workspace.name}</p>
                      <p className="text-xs text-[color:var(--text-tertiary)]">
                        {workspace.slug ?? workspace.id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.member_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.product_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.customer_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.conversation_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.open_conversation_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.knowledge_source_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {workspace.pending_suggestion_count}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {new Date(workspace.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Recent users</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Latest accounts created through Better Auth.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {users.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                <p className="truncate text-xs text-[color:var(--text-secondary)]">
                  {account.email}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-[color:var(--text-tertiary)]">
                <span>{account.email_verified ? "Verified" : "Unverified"}</span>
                <span>{new Date(account.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
