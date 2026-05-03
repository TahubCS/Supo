"use server";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { requireProductAccess } from "@/lib/product-access";

export interface WidgetConfigValues {
  botName: string;
  greeting: string;
  position: string;
  theme: string;
  accentColor: string;
}

export async function saveWidgetConfig(
  productId: string,
  values: WidgetConfigValues,
) {
  await requireProductAccess(productId, ["widget"]);

  const now = new Date();

  await db
    .insert(widgetConfig)
    .values({
      id: crypto.randomUUID(),
      productId,
      botName: values.botName,
      greeting: values.greeting,
      position: values.position,
      theme: values.theme,
      accentColor: values.accentColor,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: widgetConfig.productId,
      set: {
        botName: values.botName,
        greeting: values.greeting,
        position: values.position,
        theme: values.theme,
        accentColor: values.accentColor,
        updatedAt: now,
      },
    });
}
