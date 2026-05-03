import { and, count, eq, gte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { conversation } from "@/db/schema";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { AnalyticsDashboard } from "./AnalyticsDashboard";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "analytics")) notFound();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

  const [
    totalRows,
    openRows,
    resolvedRows,
    customersRows,
    dailyVolume,
    statusBreakdown,
    weeklyRaw,
    weeklyCustomersRaw,
  ] = await Promise.all([
    // Total conversations last 30 days
    db.select({ count: count() })
      .from(conversation)
      .where(and(eq(conversation.productId, id), gte(conversation.createdAt, thirtyDaysAgo))),
    // Open conversations (all-time)
    db.select({ count: count() })
      .from(conversation)
      .where(and(eq(conversation.productId, id), eq(conversation.status, "open"))),
    // Resolved breakdown by aiHandled
    db.select({ count: count(), aiHandled: conversation.aiHandled })
      .from(conversation)
      .where(and(eq(conversation.productId, id), eq(conversation.status, "resolved")))
      .groupBy(conversation.aiHandled),
    // Distinct customers served last 30 days
    db.select({ count: sql<number>`COUNT(DISTINCT customer_id)::int`.as("count") })
      .from(conversation)
      .where(and(eq(conversation.productId, id), gte(conversation.createdAt, thirtyDaysAgo))),
    // Daily volume last 30 days
    db.select({
      day: sql<string>`TO_CHAR(created_at, 'YYYY-MM-DD')`.as("day"),
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
      .from(conversation)
      .where(and(eq(conversation.productId, id), gte(conversation.createdAt, thirtyDaysAgo)))
      .groupBy(sql`TO_CHAR(created_at, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(created_at, 'YYYY-MM-DD')`),
    // Status distribution
    db.select({
      status: conversation.status,
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
      .from(conversation)
      .where(eq(conversation.productId, id))
      .groupBy(conversation.status),
    // Weekly AI vs human last 8 weeks
    db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD')`.as("week"),
      aiHandled: conversation.aiHandled,
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
      .from(conversation)
      .where(and(eq(conversation.productId, id), gte(conversation.createdAt, eightWeeksAgo)))
      .groupBy(sql`DATE_TRUNC('week', created_at)`, conversation.aiHandled)
      .orderBy(sql`DATE_TRUNC('week', created_at)`),
    // Weekly active customers last 8 weeks
    db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD')`.as("week"),
      count: sql<number>`COUNT(DISTINCT customer_id)::int`.as("count"),
    })
      .from(conversation)
      .where(and(eq(conversation.productId, id), gte(conversation.createdAt, eightWeeksAgo)))
      .groupBy(sql`DATE_TRUNC('week', created_at)`)
      .orderBy(sql`DATE_TRUNC('week', created_at)`),
  ]);

  // Compute summary stats
  const totalConversations = totalRows[0]?.count ?? 0;
  const openConversations = openRows[0]?.count ?? 0;
  const customersServed = (customersRows[0]?.count as number) ?? 0;

  let resolvedTotal = 0;
  let resolvedAI = 0;
  for (const row of resolvedRows) {
    resolvedTotal += row.count;
    if (row.aiHandled) resolvedAI += row.count;
  }
  const aiResolutionRate = resolvedTotal > 0 ? Math.round((resolvedAI / resolvedTotal) * 100) : 0;

  // Merge weekly AI vs human into { week, ai, human } objects
  const weeklyMap = new Map<string, { week: string; ai: number; human: number }>();
  for (const row of weeklyRaw) {
    if (!weeklyMap.has(row.week)) weeklyMap.set(row.week, { week: row.week, ai: 0, human: 0 });
    const entry = weeklyMap.get(row.week)!;
    if (row.aiHandled) entry.ai += row.count;
    else entry.human += row.count;
  }

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Analytics</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Analytics</h1>

      <AnalyticsDashboard
        stats={{
          totalConversations,
          openConversations,
          customersServed,
          aiResolutionRate,
        }}
        dailyVolume={dailyVolume}
        statusBreakdown={statusBreakdown}
        weeklyAiVsHuman={Array.from(weeklyMap.values())}
        weeklyCustomers={weeklyCustomersRaw}
      />
    </div>
  );
}
