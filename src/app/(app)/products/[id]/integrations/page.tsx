import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { apiKey, webhookEndpoint } from "@/db/schema";
import { appUrl } from "@/lib/email";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { Integrations } from "./Integrations";

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "integrations")) notFound();

  const now = new Date();
  const [keys, endpoints] = await Promise.all([
    db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        revokedAt: apiKey.revokedAt,
        createdAt: apiKey.createdAt,
      })
      .from(apiKey)
      .where(eq(apiKey.productId, id))
      .orderBy(desc(apiKey.createdAt)),
    db
      .select({
        id: webhookEndpoint.id,
        url: webhookEndpoint.url,
        description: webhookEndpoint.description,
        events: webhookEndpoint.events,
        enabled: webhookEndpoint.enabled,
        disabledReason: webhookEndpoint.disabledReason,
        consecutiveFailures: webhookEndpoint.consecutiveFailures,
        createdAt: webhookEndpoint.createdAt,
      })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.productId, id))
      .orderBy(desc(webhookEndpoint.createdAt)),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Developers</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
      <Integrations
        productId={id}
        apiBaseUrl={appUrl("/api/v1")}
        keys={keys.map((key) => ({ ...key, expired: Boolean(key.expiresAt && key.expiresAt <= now) }))}
        endpoints={endpoints}
      />
    </div>
  );
}
