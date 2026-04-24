import { eq } from "drizzle-orm";
import { BarChart2, BookOpen, Code2, MessageSquare, Plus } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { member, product } from "@/db/schema";
import { auth } from "@/lib/auth";

import { NewProductDialog } from "./NewProductDialog";

const CATEGORY_LABELS: Record<string, string> = {
  saas: "SaaS",
  "e-commerce": "E-commerce",
  "mobile-app": "Mobile app",
  "web-app": "Web app",
  other: "Other",
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) return null;

  const products = await db.query.product.findMany({
    where: eq(product.organizationId, membership.organizationId),
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="mb-1 text-sm text-[color:var(--text-secondary)]">
            Workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Products
          </h1>
        </div>
        <NewProductDialog />
      </div>

      {products.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-[color:var(--card-elevated)]">
            <Plus className="size-5 text-[color:var(--text-secondary)]" />
          </div>
          <h2 className="mb-2 text-base font-medium text-foreground">
            No products yet
          </h2>
          <p className="mb-6 max-w-xs text-sm text-[color:var(--text-secondary)]">
            Create your first product to start configuring your AI support
            widget, knowledge base, and inbox.
          </p>
          <NewProductDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border bg-card p-5 transition-colors duration-200 hover:bg-[color:var(--card-elevated)]"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <span className="shrink-0 rounded border border-border bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </span>
              </div>

              {p.description ? (
                <p className="mb-4 text-xs leading-relaxed text-[color:var(--text-secondary)] line-clamp-2">
                  {p.description}
                </p>
              ) : (
                <div className="mb-4" />
              )}

              <div className="flex items-center gap-1">
                <Link
                  href={`/products/${p.id}/inbox`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-background hover:text-foreground"
                >
                  <MessageSquare className="size-3" />
                  Inbox
                </Link>
                <Link
                  href={`/products/${p.id}/knowledge`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-background hover:text-foreground"
                >
                  <BookOpen className="size-3" />
                  Knowledge
                </Link>
                <Link
                  href={`/products/${p.id}/widget`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-background hover:text-foreground"
                >
                  <Code2 className="size-3" />
                  Widget
                </Link>
                <Link
                  href={`/products/${p.id}/analytics`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-background hover:text-foreground"
                >
                  <BarChart2 className="size-3" />
                  Analytics
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
