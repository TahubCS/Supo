"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { widgetConfig } from "@/db/schema";
import { requireProductAccess } from "@/lib/product-access";
import { normalizeWidgetConfig, type WidgetConfigValues } from "@/lib/widget-config";
import { parseAllowedOrigins } from "@/lib/widget-cors";
import {
  generateIdentitySecret,
  normalizeIdentityMode,
  type IdentityVerificationMode,
} from "@/lib/widget-identity";

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

export type SaveAllowedOriginsResult =
  | { ok: true; origins: string[] }
  | { ok: false; error: string };

export async function saveWidgetAllowedOrigins(
  productId: string,
  rawOrigins: string,
): Promise<SaveAllowedOriginsResult> {
  await requireProductAccess(productId, ["widget"]);

  const { origins, invalid } = parseAllowedOrigins(rawOrigins);
  if (invalid.length > 0) {
    return { ok: false, error: `Invalid origin: ${invalid.slice(0, 3).join(", ")}` };
  }

  const now = new Date();
  await db
    .insert(widgetConfig)
    .values({
      id: crypto.randomUUID(),
      productId,
      allowedOrigins: origins,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: widgetConfig.productId,
      set: { allowedOrigins: origins, updatedAt: now },
    });

  return { ok: true, origins };
}

export type HandoffSettingsInput = {
  handoffTimeoutSec: number;
  identityVerification: IdentityVerificationMode;
};

export async function saveWidgetHandoffSettings(
  productId: string,
  input: HandoffSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProductAccess(productId, ["widget"]);
  const handoffTimeoutSec = Math.round(Number(input.handoffTimeoutSec));
  if (!Number.isFinite(handoffTimeoutSec) || handoffTimeoutSec < 30 || handoffTimeoutSec > 3600) {
    return { ok: false, error: "Wait time must be between 30 seconds and 60 minutes" };
  }
  const mode = normalizeIdentityMode(input.identityVerification);

  const existing = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, productId),
    columns: { identitySecret: true },
  });
  if (mode !== "off" && !existing?.identitySecret) {
    return { ok: false, error: "Generate an identity secret before enabling verification" };
  }

  const now = new Date();
  await db
    .insert(widgetConfig)
    .values({
      id: crypto.randomUUID(),
      productId,
      handoffTimeoutSec,
      identityVerification: mode,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: widgetConfig.productId,
      set: { handoffTimeoutSec, identityVerification: mode, updatedAt: now },
    });
  return { ok: true };
}

/** Creates (or rotates) the identity verification secret and returns it once. */
export async function rotateIdentitySecret(productId: string): Promise<string> {
  await requireProductAccess(productId, ["widget"]);
  const secret = generateIdentitySecret();
  const now = new Date();
  await db
    .insert(widgetConfig)
    .values({ id: crypto.randomUUID(), productId, identitySecret: secret, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: widgetConfig.productId,
      set: { identitySecret: secret, updatedAt: now },
    });
  return secret;
}
