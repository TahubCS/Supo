"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, product, widgetConfig } from "@/db/schema";
import { auth } from "@/lib/auth";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

  const owned = await db.query.product.findFirst({
    where: eq(product.id, productId),
  });
  if (!owned || owned.organizationId !== membership.organizationId) {
    throw new Error("Not found");
  }

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
