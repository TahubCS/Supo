import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, widgetConfig } from "@/db/schema";
import { auth } from "@/lib/auth";

import { WidgetConfigurator } from "./WidgetConfigurator";

const DEFAULT_CONFIG = {
  botName: "Support",
  greeting: "Hi there! How can I help you today?",
  position: "bottom-right",
  theme: "dark",
  accentColor: "#18181b",
};

export default async function WidgetPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) return null;

  const orgId = membership.organizationId;

  const existing = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.organizationId, orgId),
  });

  const initialConfig = existing
    ? {
        botName: existing.botName,
        greeting: existing.greeting,
        position: existing.position,
        theme: existing.theme,
        accentColor: existing.accentColor,
      }
    : DEFAULT_CONFIG;

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Widget</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        Customer widget
      </h1>
      <WidgetConfigurator orgId={orgId} initialConfig={initialConfig} />
    </div>
  );
}
