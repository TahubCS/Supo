import { initSupo } from "./index";
import type { SupoInitOptions, SupoRuntime } from "./types";

declare global {
  interface Window {
    SupoSettings?: SupoInitOptions;
    Supo?: SupoRuntime;
  }
}

if (typeof window !== "undefined") {
  const settings = window.SupoSettings;
  if (!settings?.productId) {
    console.warn("[Supo] window.SupoSettings.productId is not set.");
  } else {
    window.Supo = initSupo(settings);
  }
}
