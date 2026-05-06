"use server";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { requireProductAccess } from "@/lib/product-access";
import { normalizeWidgetConfig, type WidgetConfigValues } from "@/lib/widget-config";

export async function saveWidgetConfig(
  productId: string,
  values: WidgetConfigValues,
) {
  await requireProductAccess(productId, ["widget"]);

  const now = new Date();
  const config = normalizeWidgetConfig(values);

  await db
    .insert(widgetConfig)
    .values({
      id: crypto.randomUUID(),
      productId,
      botName: config.botName,
      greeting: config.greeting,
      position: config.position,
      theme: config.theme,
      accentColor: config.accentColor,
      launcherLabel: config.launcherLabel,
      launcherStyle: config.launcherStyle,
      panelSize: config.panelSize,
      borderRadius: config.borderRadius,
      introTitle: config.introTitle,
      introDescription: config.introDescription,
      inputPlaceholder: config.inputPlaceholder,
      agentHandoffLabel: config.agentHandoffLabel,
      showPoweredBy: config.showPoweredBy,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: widgetConfig.productId,
      set: {
        botName: config.botName,
        greeting: config.greeting,
        position: config.position,
        theme: config.theme,
        accentColor: config.accentColor,
        launcherLabel: config.launcherLabel,
        launcherStyle: config.launcherStyle,
        panelSize: config.panelSize,
        borderRadius: config.borderRadius,
        introTitle: config.introTitle,
        introDescription: config.introDescription,
        inputPlaceholder: config.inputPlaceholder,
        agentHandoffLabel: config.agentHandoffLabel,
        showPoweredBy: config.showPoweredBy,
        updatedAt: now,
      },
    });
}
