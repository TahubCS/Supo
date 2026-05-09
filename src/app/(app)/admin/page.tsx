import { sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { isSuperAdminUserId } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/admin-server";

import { AdminUserActions } from "./AdminUserActions";

const ADMIN_SECTION_LIMIT = 50;

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
  role: string | null;
  banned: boolean | null;
  ban_reason: string | null;
  created_at: Date;
  workspace_count: string;
};

type ProductRow = {
  id: string;
  name: string;
  organization_name: string;
  category: string;
  url: string | null;
  conversation_count: string;
  knowledge_source_count: string;
  pending_suggestion_count: string;
  created_at: Date;
};

type ConversationRow = {
  id: string;
  subject: string | null;
  status: string;
  product_name: string;
  organization_name: string;
  customer_name: string;
  customer_email: string | null;
  message_count: string;
  last_message_at: Date;
};

type KnowledgeRow = {
  id: string;
  kind: "source" | "suggestion";
  label: string;
  status: string;
  product_name: string;
  organization_name: string;
  detail: string | null;
  created_at: Date;
};

type SecurityEventRow = {
  id: string;
  event_type: string;
  severity: string;
  ip_address: string | null;
  user_agent: string | null;
  path: string | null;
  method: string | null;
  metadata: unknown;
  created_at: Date;
  user_email: string | null;
  organization_name: string | null;
  product_name: string | null;
};

function toNumber(value: string): number {
  return Number.parseInt(value, 10) || 0;
}

export default async function AdminPage() {
  await requireSuperAdmin();

  const [
    workspaceResult,
    userResult,
    productResult,
    conversationResult,
    knowledgeResult,
    securityResult,
  ] = await Promise.all([
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
      SELECT
        u.id,
        u.name,
        u.email,
        u.email_verified,
        u.role,
        u.banned,
        u.ban_reason,
        u.created_at,
        COUNT(DISTINCT m.organization_id)::text AS workspace_count
      FROM "user" u
      LEFT JOIN member m ON m.user_id = u.id
      GROUP BY u.id, u.name, u.email, u.email_verified, u.role, u.banned, u.ban_reason, u.created_at
      ORDER BY u.created_at DESC
      LIMIT ${ADMIN_SECTION_LIMIT}
    `),
    db.execute(sql`
      SELECT
        p.id,
        p.name,
        o.name AS organization_name,
        p.category,
        p.url,
        COUNT(DISTINCT conv.id)::text AS conversation_count,
        COUNT(DISTINCT ks.id)::text AS knowledge_source_count,
        COUNT(DISTINCT sugg.id) FILTER (WHERE sugg.status = 'pending')::text AS pending_suggestion_count,
        p.created_at
      FROM product p
      JOIN organization o ON o.id = p.organization_id
      LEFT JOIN conversation conv ON conv.product_id = p.id
      LEFT JOIN knowledge_source ks ON ks.product_id = p.id
      LEFT JOIN knowledge_suggestion sugg ON sugg.product_id = p.id
      GROUP BY p.id, p.name, o.name, p.category, p.url, p.created_at
      ORDER BY p.created_at DESC
      LIMIT ${ADMIN_SECTION_LIMIT}
    `),
    db.execute(sql`
      SELECT
        conv.id,
        conv.subject,
        conv.status,
        p.name AS product_name,
        o.name AS organization_name,
        c.name AS customer_name,
        c.email AS customer_email,
        COUNT(msg.id)::text AS message_count,
        conv.last_message_at
      FROM conversation conv
      JOIN product p ON p.id = conv.product_id
      JOIN organization o ON o.id = p.organization_id
      JOIN customer c ON c.id = conv.customer_id
      LEFT JOIN message msg ON msg.conversation_id = conv.id
      GROUP BY conv.id, conv.subject, conv.status, p.name, o.name, c.name, c.email, conv.last_message_at
      ORDER BY conv.last_message_at DESC
      LIMIT ${ADMIN_SECTION_LIMIT}
    `),
    db.execute(sql`
      SELECT
        ks.id,
        'source' AS kind,
        ks.name AS label,
        ks.status,
        p.name AS product_name,
        o.name AS organization_name,
        ks.type AS detail,
        ks.created_at
      FROM knowledge_source ks
      JOIN product p ON p.id = ks.product_id
      JOIN organization o ON o.id = p.organization_id
      UNION ALL
      SELECT
        sugg.id,
        'suggestion' AS kind,
        sugg.question AS label,
        sugg.status,
        p.name AS product_name,
        o.name AS organization_name,
        sugg.kind AS detail,
        sugg.created_at
      FROM knowledge_suggestion sugg
      JOIN product p ON p.id = sugg.product_id
      JOIN organization o ON o.id = p.organization_id
      ORDER BY created_at DESC
      LIMIT ${ADMIN_SECTION_LIMIT}
    `),
    db.execute(sql`
      SELECT
        se.id,
        se.event_type,
        se.severity,
        se.ip_address,
        se.user_agent,
        se.path,
        se.method,
        se.metadata,
        se.created_at,
        u.email AS user_email,
        o.name AS organization_name,
        p.name AS product_name
      FROM security_event se
      LEFT JOIN "user" u ON u.id = se.user_id
      LEFT JOIN organization o ON o.id = se.organization_id
      LEFT JOIN product p ON p.id = se.product_id
      ORDER BY se.created_at DESC
      LIMIT ${ADMIN_SECTION_LIMIT}
    `),
  ]);

  const workspaces = workspaceResult.rows as WorkspaceRow[];
  const users = userResult.rows as UserRow[];
  const products = productResult.rows as ProductRow[];
  const conversations = conversationResult.rows as ConversationRow[];
  const knowledgeItems = knowledgeResult.rows as KnowledgeRow[];
  const securityEvents = securityResult.rows as SecurityEventRow[];
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
          <p className="text-sm font-semibold text-foreground">All users</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Better Auth accounts, verification, role, ban state, workspace count, and guarded admin controls. Showing latest {ADMIN_SECTION_LIMIT}.
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
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 text-xs text-[color:var(--text-tertiary)]">
                <div className="flex items-center gap-3">
                  <span>{account.role ?? "user"}</span>
                  <span>{account.banned ? "Banned" : "Active"}</span>
                  <span>{account.email_verified ? "Verified" : "Unverified"}</span>
                  <span>{account.workspace_count} workspace(s)</span>
                  <span>{new Date(account.created_at).toLocaleDateString()}</span>
                </div>
                <AdminUserActions
                  user={{
                    id: account.id,
                    name: account.name,
                    email: account.email,
                    banned: Boolean(account.banned),
                    isSuperAdmin: isSuperAdminUserId(account.id),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">All products</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Product-level footprint across every workspace. Showing latest {ADMIN_SECTION_LIMIT}.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {products.map((item) => (
              <div key={item.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">
                      {item.organization_name}
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
                    {item.category}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--text-tertiary)]">
                  <span>{item.conversation_count} conversations</span>
                  <span>{item.knowledge_source_count} sources</span>
                  <span>{item.pending_suggestion_count} pending KB</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">All conversations</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Latest support activity across every product. Showing latest {ADMIN_SECTION_LIMIT}.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {conversations.map((item) => (
              <div key={item.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.subject ?? "Untitled conversation"}
                    </p>
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">
                      {item.customer_name} ({item.customer_email ?? "No email provided"})
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--text-tertiary)]">
                  <span>{item.organization_name}</span>
                  <span>{item.product_name}</span>
                  <span>{item.message_count} messages</span>
                  <span>{new Date(item.last_message_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Security activity</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Latest quota, suspicious-session, and firewall events. Showing latest {ADMIN_SECTION_LIMIT}.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {securityEvents.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">
              No security events logged yet.
            </div>
          ) : (
            securityEvents.map((event) => (
              <div key={event.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {event.event_type}
                    </p>
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">
                      {event.user_email ?? "No user"} /{" "}
                      {event.organization_name ?? "No workspace"} /{" "}
                      {event.product_name ?? "No product"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
                    {event.severity}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--text-tertiary)]">
                  <span>{event.method ?? "method?"} {event.path ?? "path?"}</span>
                  <span>IP: {event.ip_address ?? "unknown"}</span>
                  <span>{new Date(event.created_at).toLocaleString()}</span>
                </div>
                {event.user_agent ? (
                  <p className="mt-1 truncate text-xs text-[color:var(--text-tertiary)]">
                    {event.user_agent}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Knowledge activity</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Sources and review suggestions across every product. Showing latest {ADMIN_SECTION_LIMIT}.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {knowledgeItems.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                <p className="truncate text-xs text-[color:var(--text-secondary)]">
                  {item.organization_name} / {item.product_name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-[color:var(--text-tertiary)]">
                <span>{item.kind}</span>
                <span>{item.detail}</span>
                <span>{item.status}</span>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
