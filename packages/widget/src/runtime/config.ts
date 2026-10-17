import type { SupoAppearance, SupoInitOptions, SupoWidgetConfigResponse } from "../types";
import { normalizeAppearance } from "./validation";

// Supo Cloud. Must match PRODUCTION_ORIGIN in src/lib/trusted-origins.ts.
export const DEFAULT_API_BASE_URL = "https://supo.muhammadtahubkhatri.dev";

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

// Not derived from `document.currentScript`: for npm/ESM usage that can be the
// host page's own bundle. The widget.js embed passes its origin explicitly.
export function resolveApiBaseUrl(options: Pick<SupoInitOptions, "apiBaseUrl">): string {
  const explicit = options.apiBaseUrl?.trim().replace(/\/+$/, "");
  return explicit || DEFAULT_API_BASE_URL;
}

export function scriptOrigin(
  script: Pick<HTMLScriptElement, "src"> | SVGScriptElement | null | undefined,
): string | undefined {
  if (!script || !("src" in script) || !script.src) return undefined;
  try {
    return new URL(script.src).origin;
  } catch {
    return undefined;
  }
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
