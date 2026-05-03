import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Activity, Mail, MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

export default async function UserActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "userActivity")) {
    notFound();
  }

  const conversations = await db.query.conversation.findMany({
    where:
      access.role === "agent"
        ? and(
            eq(conversation.productId, id),
            or(
              eq(conversation.assigneeId, access.session.user.id),
              and(
                eq(conversation.escalationStatus, "pending"),
                isNull(conversation.assigneeId),
              ),
            ),
          )
        : eq(conversation.productId, id),
    with: { customer: { columns: { id: true, name: true, email: true } } },
    orderBy: [desc(conversation.lastMessageAt)],
    limit: 25,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          User activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          A read-only customer context view for support work. Deeper session hooks and
          replay-style debugging are planned after the React SDK contract is stable.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Activity className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Recent customer threads</h2>
        </div>
        <div className="divide-y divide-border">
          {conversations.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[color:var(--text-secondary)]">
              No activity yet
            </div>
          ) : (
            conversations.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 shrink-0 text-[color:var(--text-secondary)]" />
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.customer.name}
                    </p>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {item.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]">
                    <Mail className="size-3" />
                    <span className="truncate">{item.customer.email}</span>
                  </div>
                </div>
                <time className="shrink-0 text-xs text-[color:var(--text-tertiary)]">
                  {item.lastMessageAt.toLocaleString()}
                </time>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
