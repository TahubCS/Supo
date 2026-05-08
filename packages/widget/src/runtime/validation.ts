import type { SupoAppearance, SupoCustomer } from "../types";

const TEXT_LIMITS = {
  botName: 32,
  greeting: 160,
  launcherLabel: 32,
  introTitle: 64,
  introDescription: 140,
  inputPlaceholder: 64,
  agentHandoffLabel: 48,
} satisfies Partial<Record<keyof SupoAppearance, number>>;

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

export function normalizeCustomer(value: unknown): SupoCustomer | null {
  if (!isObject(value)) return null;
  const name = text(value.name, 120);
  const email = text(value.email, 254)?.toLowerCase();
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name, email };
}

export function normalizeAppearance(value: unknown): SupoAppearance {
  if (!isObject(value)) return {};
  const next: SupoAppearance = {};

  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    const normalized = text(value[key], limit);
    if (normalized) {
      (next as Record<string, string>)[key] = normalized;
    }
  }

  const accent = text(value.accentColor, 24);
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) next.accentColor = accent as `#${string}`;
  next.theme = enumValue(value.theme, ["dark", "light"] as const);
  next.position = enumValue(value.position, ["bottom-right", "bottom-left"] as const);
  next.launcherStyle = enumValue(value.launcherStyle, ["icon", "icon-label"] as const);
  next.panelSize = enumValue(value.panelSize, ["compact", "standard", "wide"] as const);
  next.borderRadius = enumValue(value.borderRadius, ["soft", "rounded", "square"] as const);
  if (typeof value.showPoweredBy === "boolean") next.showPoweredBy = value.showPoweredBy;

  return Object.fromEntries(
    Object.entries(next).filter(([, entry]) => entry !== undefined),
  ) as SupoAppearance;
}
