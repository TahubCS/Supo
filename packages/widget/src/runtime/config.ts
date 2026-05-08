import type { SupoAppearance, SupoInitOptions, SupoWidgetConfigResponse } from "../types";
import { normalizeAppearance } from "./validation";

export const DEFAULT_API_BASE_URL = "https://app.supo.com";

export const DEFAULT_APPEARANCE: Required<SupoAppearance> = {
  botName: "Support",
  greeting: "Hi there! How can I help you today?",
  accentColor: "#18181b",
  position: "bottom-right",
  theme: "dark",
  launcherLabel: "Support",
  launcherStyle: "icon",
  panelSize: "standard",
  borderRadius: "rounded",
  introTitle: "Start a conversation",
  introDescription: "Enter your details so we can help you.",
  inputPlaceholder: "Ask a question...",
  agentHandoffLabel: "Speak to an Agent",
  showPoweredBy: true,
};

export function resolveApiBaseUrl(options: Pick<SupoInitOptions, "apiBaseUrl">): string {
  const explicit = options.apiBaseUrl?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const script = typeof document !== "undefined" ? document.currentScript : null;
  if (script instanceof HTMLScriptElement && script.src) {
    return new URL(script.src).origin;
  }

  return DEFAULT_API_BASE_URL;
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function loadWidgetConfig({
  apiBaseUrl,
  productId,
}: {
  apiBaseUrl: string;
  productId: string;
}): Promise<SupoWidgetConfigResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/widget/config?productId=${encodeURIComponent(productId)}`,
  );
  if (!response.ok) throw new Error(`Supo config failed: ${response.status}`);
  return (await response.json()) as SupoWidgetConfigResponse;
}

export function mergeAppearance(
  server: Partial<SupoAppearance> | undefined,
  runtime: Partial<SupoAppearance> | undefined,
): Required<SupoAppearance> {
  return {
    ...DEFAULT_APPEARANCE,
    ...normalizeAppearance(server),
    ...normalizeAppearance(runtime),
  };
}
