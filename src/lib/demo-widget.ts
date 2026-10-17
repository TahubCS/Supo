// Loads the public widget bundle the way customers embed it (the "Script tag"
// snippet), and removes it on unmount so the launcher does not follow the
// visitor into the app after a client-side navigation.

export const WIDGET_SCRIPT_SRC = "/widget.js";

export function mountDemoWidget(productId: string): () => void {
  let disposed = false;
  window.SupoSettings = { productId };

  const script = document.createElement("script");
  script.src = WIDGET_SCRIPT_SRC;
  script.async = true;
  // A script that started loading still runs after it is removed, and widget.js
  // creates window.Supo as it runs. Tear down an instance that arrives late.
  script.addEventListener("load", () => {
    if (!disposed) return;
    window.Supo?.destroy();
    delete window.Supo;
  });

  // React StrictMode mounts, unmounts and remounts synchronously in development;
  // deferring the insert means the discarded first mount never loads the bundle.
  const timer = window.setTimeout(() => document.body.appendChild(script), 0);

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    script.remove();
    window.Supo?.destroy();
    delete window.Supo;
    delete window.SupoSettings;
  };
}
