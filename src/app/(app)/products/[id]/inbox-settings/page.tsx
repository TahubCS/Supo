import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { macro, slaPolicy, widgetConfig } from "@/db/schema";
import { getBusinessHours } from "@/lib/sla/service";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { InboxSettings } from "./InboxSettings";
import { ServiceLevelSettings } from "./ServiceLevelSettings";

export default async function InboxSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "inboxSettings")) notFound();

  const macros = await db.query.macro.findMany({
    where: eq(macro.productId, id),
    orderBy: [asc(macro.title)],
  });
  const [hours, policies, widget] = await Promise.all([
    getBusinessHours(id),
    db.query.slaPolicy.findMany({ where: eq(slaPolicy.productId, id) }),
    db.query.widgetConfig.findFirst({ where: eq(widgetConfig.productId, id), columns: { csatEnabled: true } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Conversations</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Inbox settings</h1>
      <InboxSettings
        productId={id}
        routingMode={access.product.routingMode === "round_robin" ? "round_robin" : "manual"}
        maxConcurrentChats={access.product.maxConcurrentChats}
        macros={macros.map((m) => ({
          id: m.id,
          title: m.title,
          shortcut: m.shortcut,
          body: m.body,
          actions: m.actions,
          usageCount: m.usageCount,
        }))}
      />
      <ServiceLevelSettings
        productId={id}
        businessHours={hours}
        policies={policies.map((p) => ({
          priority: p.priority,
          firstResponseMinutes: p.firstResponseMinutes,
          resolutionMinutes: p.resolutionMinutes,
        }))}
        csatEnabled={widget?.csatEnabled ?? true}
      />
    </div>
  );
}
