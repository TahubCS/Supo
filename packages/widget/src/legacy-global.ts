import { initSupo } from "./index";
import { scriptOrigin } from "./runtime/config";
import type { SupoInitOptions, SupoRuntime } from "./types";

declare global {
  interface Window {
    SupoSettings?: SupoInitOptions;
    Supo?: SupoRuntime;
  }
}

// Read while widget.js is executing; `document.currentScript` is null afterwards.
const loaderOrigin = typeof document !== "undefined" ? scriptOrigin(document.currentScript) : undefined;

if (typeof window !== "undefined") {
  const settings = window.SupoSettings;
  if (!settings?.productId) {
    console.warn("[Supo] window.SupoSettings.productId is not set.");
  } else {
    window.Supo = initSupo({ ...settings, apiBaseUrl: settings.apiBaseUrl?.trim() || loaderOrigin });
  }
}
