// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, describe, expect, it, vi } from "vitest";

import { WIDGET_SCRIPT_SRC, mountDemoWidget } from "@/lib/demo-widget";

function widgetScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT_SRC}"]`));
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Stands in for widget.js running: it reads SupoSettings and creates window.Supo.
function runWidgetScript(script: HTMLScriptElement) {
  const runtime = { destroy: vi.fn() };
  window.Supo = runtime as unknown as NonNullable<typeof window.Supo>;
  script.dispatchEvent(new Event("load"));
  return runtime;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const script of widgetScripts()) script.remove();
  delete window.Supo;
  delete window.SupoSettings;
});

describe("mountDemoWidget", () => {
  it("configures the product and loads the public widget bundle once", async () => {
    mountDemoWidget("prod_demo");

    expect(window.SupoSettings).toEqual({ productId: "prod_demo" });
    await nextTick();

    const scripts = widgetScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].async).toBe(true);
  });

  it("loads a single bundle across React StrictMode's mount, unmount, remount", async () => {
    // Count insertions, not survivors: a removed script that started loading still runs.
    const append = vi.spyOn(document.body, "appendChild");

    const cleanup = mountDemoWidget("prod_demo");
    cleanup();
    mountDemoWidget("prod_demo");
    await nextTick();

    expect(append).toHaveBeenCalledOnce();
    expect(widgetScripts()).toHaveLength(1);
    expect(window.SupoSettings).toEqual({ productId: "prod_demo" });
  });

  it("removes the widget and its globals on unmount", async () => {
    const cleanup = mountDemoWidget("prod_demo");
    await nextTick();
    const runtime = runWidgetScript(widgetScripts()[0]);

    cleanup();

    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(window.Supo).toBeUndefined();
    expect(window.SupoSettings).toBeUndefined();
    expect(widgetScripts()).toHaveLength(0);
  });

  it("tears down a widget whose script finishes loading after unmount", async () => {
    const cleanup = mountDemoWidget("prod_demo");
    await nextTick();
    const script = widgetScripts()[0];

    cleanup();
    const runtime = runWidgetScript(script);

    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(window.Supo).toBeUndefined();
  });

  it("keeps control of the current widget when a stale script finishes after it", async () => {
    // Leave the page while the first bundle is loading, come back, and let the
    // second bundle finish first: the late first script must not orphan it.
    const cleanupFirst = mountDemoWidget("prod_demo");
    await nextTick();
    const firstScript = widgetScripts()[0];
    cleanupFirst();

    const cleanupSecond = mountDemoWidget("prod_demo");
    await nextTick();
    const current = runWidgetScript(widgetScripts()[0]);
    const stale = runWidgetScript(firstScript);

    expect(stale.destroy).toHaveBeenCalledOnce();
    expect(current.destroy).not.toHaveBeenCalled();

    cleanupSecond();
    expect(current.destroy).toHaveBeenCalledOnce();
  });

  it("leaves a widget that loaded while mounted running", async () => {
    mountDemoWidget("prod_demo");
    await nextTick();
    const runtime = runWidgetScript(widgetScripts()[0]);

    expect(runtime.destroy).not.toHaveBeenCalled();
    expect(window.Supo).toBe(runtime);
  });
});
