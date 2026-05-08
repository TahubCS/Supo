import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { env } from "@/lib/env";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";
import { normalizeWidgetConfig } from "@/lib/widget-config";

import { WidgetConfigurator } from "./WidgetConfigurator";

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "widget")) notFound();

  const existing = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, id),
  });

  const initialConfig = normalizeWidgetConfig(existing);

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Widget</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        Customer widget
      </h1>
      <WidgetConfigurator
        productId={id}
        initialConfig={initialConfig}
        widgetUrl={`${env.BETTER_AUTH_URL}/widget.js`}
        apiBaseUrl={env.BETTER_AUTH_URL}
      />
    </div>
  );
}
