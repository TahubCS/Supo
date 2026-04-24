"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, widgetConfig } from "@/db/schema";
import { auth } from "@/lib/auth";

export interface WidgetConfigValues {
  botName: string;
  greeting: string;
  position: string;
  theme: string;
  accentColor: string;
}

export async function saveWidgetConfig(values: WidgetConfigValues) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

  const orgId = membership.organizationId;
  const now = new Date();

  await db
    .insert(widgetConfig)
    .values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      botName: values.botName,
      greeting: values.greeting,
      position: values.position,
      theme: values.theme,
      accentColor: values.accentColor,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: widgetConfig.organizationId,
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
