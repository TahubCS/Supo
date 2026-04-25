import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

import { WidgetConfigurator } from "./WidgetConfigurator";

const DEFAULT_CONFIG = {
  botName: "Support",
  greeting: "Hi there! How can I help you today?",
  position: "bottom-right",
  theme: "dark",
  accentColor: "#18181b",
};

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const existing = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, id),
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
      <WidgetConfigurator
        productId={id}
        initialConfig={initialConfig}
        widgetUrl={`${env.BETTER_AUTH_URL}/widget.js`}
      />
    </div>
  );
}
