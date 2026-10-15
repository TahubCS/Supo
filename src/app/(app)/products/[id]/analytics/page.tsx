import { notFound } from "next/navigation";

import { getProductAnalytics, parseRange } from "@/lib/analytics/service";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { AnalyticsDashboard } from "./AnalyticsDashboard";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range } = await searchParams;

  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "analytics")) notFound();

  const analytics = await getProductAnalytics(id, parseRange(range));

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Analytics</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Analytics</h1>

      <AnalyticsDashboard productId={id} analytics={analytics} />
    </div>
  );
}
