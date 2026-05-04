export const WIDGET_CONFIG_DEFAULTS = {
  botName: "Support",
  greeting: "Hi there! How can I help you today?",
  position: "bottom-right",
  theme: "dark",
  accentColor: "#18181b",
  launcherLabel: "Support",
  launcherStyle: "icon",
  panelSize: "standard",
  borderRadius: "rounded",
  introTitle: "Start a conversation",
  introDescription: "Enter your details so we can help you.",
  inputPlaceholder: "Ask a question...",
  agentHandoffLabel: "Speak to an Agent",
  showPoweredBy: true,
} as const;

export const WIDGET_CONFIG_LIMITS = {
  botName: 32,
  greeting: 160,
  launcherLabel: 32,
  introTitle: 64,
  introDescription: 140,
  inputPlaceholder: 64,
  agentHandoffLabel: 48,
} as const;

export const WIDGET_POSITIONS = ["bottom-right", "bottom-left"] as const;
export const WIDGET_THEMES = ["dark", "light"] as const;
export const WIDGET_LAUNCHER_STYLES = ["icon", "icon-label"] as const;
export const WIDGET_PANEL_SIZES = ["compact", "standard", "wide"] as const;
export const WIDGET_BORDER_RADII = ["soft", "rounded", "square"] as const;

export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];
export type WidgetTheme = (typeof WIDGET_THEMES)[number];
export type WidgetLauncherStyle = (typeof WIDGET_LAUNCHER_STYLES)[number];
export type WidgetPanelSize = (typeof WIDGET_PANEL_SIZES)[number];
export type WidgetBorderRadius = (typeof WIDGET_BORDER_RADII)[number];

export type WidgetConfigValues = {
  botName: string;
  greeting: string;
  position: WidgetPosition;
  theme: WidgetTheme;
  accentColor: string;
  launcherLabel: string;
  launcherStyle: WidgetLauncherStyle;
  panelSize: WidgetPanelSize;
  borderRadius: WidgetBorderRadius;
  introTitle: string;
  introDescription: string;
  inputPlaceholder: string;
  agentHandoffLabel: string;
  showPoweredBy: boolean;
};

type WidgetConfigInput = Partial<Record<keyof WidgetConfigValues, string | boolean | null>>;

function clampText(value: string | boolean | null | undefined, fallback: string, maxLength: number) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function enumValue<T extends readonly string[]>(
  value: string | boolean | null | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function colorValue(value: string | boolean | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed && /^#[0-9a-f]{6}$/i.test(trimmed)
    ? trimmed
    : WIDGET_CONFIG_DEFAULTS.accentColor;
}

export function normalizeWidgetConfig(input: WidgetConfigInput | null | undefined): WidgetConfigValues {
  return {
    botName: clampText(
      input?.botName,
      WIDGET_CONFIG_DEFAULTS.botName,
      WIDGET_CONFIG_LIMITS.botName,
    ),
    greeting: clampText(
      input?.greeting,
      WIDGET_CONFIG_DEFAULTS.greeting,
      WIDGET_CONFIG_LIMITS.greeting,
    ),
    position: enumValue(input?.position, WIDGET_POSITIONS, WIDGET_CONFIG_DEFAULTS.position),
    theme: enumValue(input?.theme, WIDGET_THEMES, WIDGET_CONFIG_DEFAULTS.theme),
    accentColor: colorValue(input?.accentColor),
    launcherLabel: clampText(
      input?.launcherLabel,
      WIDGET_CONFIG_DEFAULTS.launcherLabel,
      WIDGET_CONFIG_LIMITS.launcherLabel,
    ),
    launcherStyle: enumValue(
      input?.launcherStyle,
      WIDGET_LAUNCHER_STYLES,
      WIDGET_CONFIG_DEFAULTS.launcherStyle,
    ),
    panelSize: enumValue(input?.panelSize, WIDGET_PANEL_SIZES, WIDGET_CONFIG_DEFAULTS.panelSize),
    borderRadius: enumValue(
      input?.borderRadius,
      WIDGET_BORDER_RADII,
      WIDGET_CONFIG_DEFAULTS.borderRadius,
    ),
    introTitle: clampText(
      input?.introTitle,
      WIDGET_CONFIG_DEFAULTS.introTitle,
      WIDGET_CONFIG_LIMITS.introTitle,
    ),
    introDescription: clampText(
      input?.introDescription,
      WIDGET_CONFIG_DEFAULTS.introDescription,
      WIDGET_CONFIG_LIMITS.introDescription,
    ),
    inputPlaceholder: clampText(
      input?.inputPlaceholder,
      WIDGET_CONFIG_DEFAULTS.inputPlaceholder,
      WIDGET_CONFIG_LIMITS.inputPlaceholder,
    ),
    agentHandoffLabel: clampText(
      input?.agentHandoffLabel,
      WIDGET_CONFIG_DEFAULTS.agentHandoffLabel,
      WIDGET_CONFIG_LIMITS.agentHandoffLabel,
    ),
    showPoweredBy:
      typeof input?.showPoweredBy === "boolean"
        ? input.showPoweredBy
        : WIDGET_CONFIG_DEFAULTS.showPoweredBy,
  };
}
