// Loads the public widget bundle the way customers embed it (the "Script tag"
// snippet), and removes it on unmount so the launcher does not follow the
// visitor into the app after a client-side navigation.

export const WIDGET_SCRIPT_SRC = "/widget.js";

export function mountDemoWidget(productId: string): () => void {
  let disposed = false;
  // The widget this mount's script created. Tracked per mount rather than read
  // from window.Supo, which a stale script from an earlier mount can overwrite.
  let runtime: typeof window.Supo;
  window.SupoSettings = { productId };

  const teardown = () => {
    runtime?.destroy();
    if (window.Supo === runtime) delete window.Supo;
    runtime = undefined;
  };

  const script = document.createElement("script");
  script.src = WIDGET_SCRIPT_SRC;
  script.async = true;
  // widget.js assigns window.Supo while it runs, and `load` fires right after, so
  // the global here is this script's widget. A script that started loading
  // still runs after it is removed; tear its widget down if we're gone.
  script.addEventListener("load", () => {
    runtime = window.Supo;
    if (disposed) teardown();
  });

  // React StrictMode mounts, unmounts and remounts synchronously in development;
  // deferring the insert means the discarded first mount never loads the bundle.
  const timer = window.setTimeout(() => document.body.appendChild(script), 0);

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    script.remove();
    teardown();
    delete window.SupoSettings;
  };
}
