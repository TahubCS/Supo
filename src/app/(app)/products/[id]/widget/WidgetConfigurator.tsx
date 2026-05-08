"use client";

import { Check, Copy, MessageCircle, Package, Play, Settings2, Terminal, Wrench } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  WIDGET_BORDER_RADII,
  WIDGET_CONFIG_LIMITS,
  WIDGET_LAUNCHER_STYLES,
  WIDGET_PANEL_SIZES,
  WIDGET_POSITIONS,
  WIDGET_THEMES,
  normalizeWidgetConfig,
  type WidgetConfigValues,
} from "@/lib/widget-config";

import { saveWidgetConfig } from "./actions";

type MainTab = "install" | "configure" | "preview" | "reference" | "fallback";
type FrameworkTab = "react" | "nextjs" | "vite" | "vanilla";

const MAIN_TABS: { id: MainTab; label: string; icon: typeof Package }[] = [
  { id: "install", label: "Install", icon: Package },
  { id: "configure", label: "Configure", icon: Settings2 },
  { id: "preview", label: "Preview", icon: Play },
  { id: "reference", label: "Reference", icon: Terminal },
  { id: "fallback", label: "Fallback embed", icon: Wrench },
];

const FRAMEWORK_TABS: { id: FrameworkTab; label: string }[] = [
  { id: "react", label: "React" },
  { id: "nextjs", label: "Next.js" },
  { id: "vite", label: "Vite" },
  { id: "vanilla", label: "Vanilla TS" },
];

const ACCENT_COLORS = [
  { value: "#18181b", label: "Neutral" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f97316", label: "Orange" },
];

const PANEL_WIDTHS: Record<WidgetConfigValues["panelSize"], number> = {
  compact: 300,
  standard: 340,
  wide: 380,
};

const PANEL_RADII: Record<WidgetConfigValues["borderRadius"], number> = {
  soft: 8,
  rounded: 16,
  square: 2,
};

function formatOption(value: string) {
  return value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
          {description}
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CodeBlock({
  code,
  copyId,
  copiedKey,
  onCopy,
  title,
}: {
  code: string;
  copyId: string;
  copiedKey: string | null;
  onCopy: (key: string, code: string) => void;
  title?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-xs text-[color:var(--text-secondary)]">{title ?? "Copy snippet"}</p>
        <button
          type="button"
          onClick={() => onCopy(copyId, code)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--card-elevated)] hover:text-foreground"
        >
          {copiedKey === copyId ? (
            <>
              <Check className="size-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-xs leading-relaxed text-[color:var(--text-secondary)]">
        {code}
      </pre>
    </div>
  );
}

function WidgetPreview({
  config,
  identified,
  hiddenLauncher,
}: {
  config: WidgetConfigValues;
  identified: boolean;
  hiddenLauncher: boolean;
}) {
  const isDark = config.theme === "dark";
  const panelBg = isDark ? "#18181b" : "#ffffff";
  const panelBorder = isDark ? "#27272a" : "#e4e4e7";
  const bubbleBg = isDark ? "#27272a" : "#f4f4f5";
  const bubbleText = isDark ? "#a1a1aa" : "#52525b";
  const panelRadius = PANEL_RADII[config.borderRadius];

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-lg border border-border bg-[color:var(--card-elevated)]">
      <div className="space-y-2 p-6">
        {[72, 88, 55, 91, 68, 80, 60].map((width, index) => (
          <div
            key={index}
            className="h-2 rounded-full bg-border opacity-60"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col items-end">
        <div
          className="mb-2 overflow-hidden shadow-xl"
          style={{
            width: Math.round(PANEL_WIDTHS[config.panelSize] * 0.82),
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: panelRadius,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: config.accentColor }}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <MessageCircle className="size-3 text-white" />
            </div>
            <span className="truncate text-xs font-medium text-white">{config.botName}</span>
          </div>
          <div
            className="border-b px-3 py-2 text-[10px] leading-relaxed"
            style={{
              borderColor: panelBorder,
              background: isDark ? "#241f13" : "#fffbeb",
              color: isDark ? "#facc15" : "#92400e",
            }}
          >
            <strong>BETA testing:</strong> this widget is unstable at the moment.
          </div>
          <div className="space-y-2 p-3">
            {identified ? (
              <>
                <div
                  className="px-3 py-2 text-xs leading-relaxed"
                  style={{
                    background: bubbleBg,
                    color: bubbleText,
                    borderRadius: Math.max(panelRadius - 2, 2),
                  }}
                >
                  {config.greeting}
                </div>
                <div className="ml-auto w-fit rounded-lg px-3 py-2 text-xs text-white" style={{ background: config.accentColor }}>
                  I need help with billing.
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs font-medium" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
                  {config.introTitle}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed" style={{ color: bubbleText }}>
                  {config.introDescription}
                </p>
              </div>
            )}
          </div>
          {config.showPoweredBy ? (
            <div className="pb-2 text-center text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
              Powered by Supo
            </div>
          ) : null}
        </div>
        {hiddenLauncher ? (
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
            Host app owns the help button
          </div>
        ) : (
          <div
            className="flex h-10 items-center justify-center gap-2 px-3 shadow-lg"
            style={{
              minWidth: config.launcherStyle === "icon-label" ? 112 : 40,
              borderRadius: config.borderRadius === "square" ? 8 : 999,
              background: config.accentColor,
            }}
          >
            <MessageCircle className="size-5 text-white" />
            {config.launcherStyle === "icon-label" ? (
              <span className="truncate text-xs font-medium text-white">{config.launcherLabel}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

interface WidgetConfiguratorProps {
  productId: string;
  initialConfig: WidgetConfigValues;
  widgetUrl: string;
  apiBaseUrl: string;
}

export function WidgetConfigurator({
  productId,
  initialConfig,
  widgetUrl,
  apiBaseUrl,
}: WidgetConfiguratorProps) {
  const [config, setConfig] = useState<WidgetConfigValues>(initialConfig);
  const [activeTab, setActiveTab] = useState<MainTab>("install");
  const [frameworkTab, setFrameworkTab] = useState<FrameworkTab>("react");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewIdentified, setPreviewIdentified] = useState(true);
  const [previewHiddenLauncher, setPreviewHiddenLauncher] = useState(false);
  const [isPending, startTransition] = useTransition();

  const appearanceSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          theme: config.theme,
          accentColor: config.accentColor,
          launcherStyle: config.launcherStyle,
          launcherLabel: config.launcherLabel,
          panelSize: config.panelSize,
          borderRadius: config.borderRadius,
        },
        null,
        2,
      ),
    [config],
  );

  const reactSnippet = `"use client";

import { SupoProvider, SupoWidget } from "@supoapp/widget/react";

export function SupportWidget({ user, children }) {
  return (
    <SupoProvider
      productId="${productId}"
      apiBaseUrl="${apiBaseUrl}"
      customer={{ name: user.name, email: user.email }}
      appearance={${appearanceSnippet.replaceAll("\n", "\n        ")}}
    >
      {children}
      <SupoWidget />
    </SupoProvider>
  );
}`;

  const vanillaSnippet = `import { initSupo } from "@supoapp/widget";

const supo = initSupo({
  productId: "${productId}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: () => window.currentUser ?? null,
  appearance: ${appearanceSnippet},
});

document.querySelector("#help")?.addEventListener("click", () => {
  supo.open();
});`;

  const headlessSnippet = `import { createSupoClient } from "@supoapp/widget/headless";

const client = createSupoClient({
  productId: "${productId}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: { name: user.name, email: user.email },
});

const answer = await client.sendMessage("I need help with billing");

client.on("message", (message) => {
  console.log(message);
});`;

  const fallbackSnippet = `<script>
  window.SupoSettings = {
    productId: "${productId}",
    apiBaseUrl: "${apiBaseUrl}",
    appearance: ${appearanceSnippet.replaceAll("\n", "\n    ")}
  };
</script>
<script async src="${widgetUrl}"></script>`;

  const frameworkSnippets: Record<FrameworkTab, string> = {
    react: reactSnippet,
    nextjs: reactSnippet,
    vite: `npm install @supoapp/widget@alpha

${reactSnippet}`,
    vanilla: vanillaSnippet,
  };

  const copyCode = async (key: string, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const set = <Key extends keyof WidgetConfigValues>(
    key: Key,
    value: WidgetConfigValues[Key],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    startTransition(async () => {
      const normalized = normalizeWidgetConfig(config);
      await saveWidgetConfig(productId, normalized);
      setConfig(normalized);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const segmentClass = (active: boolean) =>
    `px-3 py-1.5 text-xs transition-colors duration-150 ${
      active
        ? "bg-[color:var(--card-elevated)] text-foreground"
        : "text-[color:var(--text-secondary)] hover:text-foreground"
    }`;

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg ${segmentClass(activeTab === tab.id)}`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "install" ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-[color:var(--text-secondary)]">Recommended integration</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Install Supo as one dependency
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
              Use `@supoapp/widget` for React, Next.js, Vite, vanilla TypeScript, and headless custom UI.
              The package calls Supo APIs at runtime; developers do not load a remote widget script.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <CodeBlock
                title="Install"
                code="npm install @supoapp/widget@alpha"
                copyId="install-npm"
                copiedKey={copiedKey}
                onCopy={copyCode}
              />
              <div className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
                <p className="text-xs text-[color:var(--text-secondary)]">Product id</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <code className="truncate font-mono text-sm text-foreground">{productId}</code>
                  <button
                    type="button"
                    onClick={() => copyCode("product-id", productId)}
                    className="rounded-md p-1.5 text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground"
                  >
                    {copiedKey === "product-id" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
                <p className="text-xs text-[color:var(--text-secondary)]">Integration health</p>
                <div className="mt-3 space-y-2 text-xs text-[color:var(--text-secondary)]">
                  <p>Config route: `/api/widget/config`</p>
                  <p>Realtime: Ably with polling fallback</p>
                  <p>Local API: {apiBaseUrl}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex overflow-hidden rounded-lg border border-border">
              {FRAMEWORK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFrameworkTab(tab.id)}
                  className={`flex-1 ${segmentClass(frameworkTab === tab.id)}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <CodeBlock
              title={`Use with ${FRAMEWORK_TABS.find((tab) => tab.id === frameworkTab)?.label}`}
              code={frameworkSnippets[frameworkTab]}
              copyId={`framework-${frameworkTab}`}
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </section>
        </div>
      ) : null}

      {activeTab === "configure" ? (
        <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
          <div className="space-y-4">
            <Section
              title="Saved defaults"
              description="These values live in Supo and act as fallback defaults. SDK options override them per app, page, or user."
            >
              <div className="space-y-2">
                <Label htmlFor="botName">Bot name</Label>
                <Input
                  id="botName"
                  value={config.botName}
                  onChange={(event) => set("botName", event.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.botName}
                />
              </div>
              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_THEMES.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => set("theme", theme)}
                      className={`flex-1 capitalize ${segmentClass(config.theme === theme)}`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accent color</Label>
                <div className="flex items-center gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.label}
                      onClick={() => set("accentColor", color.value)}
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ background: color.value }}
                    >
                      {config.accentColor === color.value ? <Check className="size-3 text-white" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Launcher style</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_LAUNCHER_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => set("launcherStyle", style)}
                      className={`flex-1 ${segmentClass(config.launcherStyle === style)}`}
                    >
                      {style === "icon" ? "Icon" : "Icon + label"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="launcherLabel">Launcher label</Label>
                <Input
                  id="launcherLabel"
                  value={config.launcherLabel}
                  onChange={(event) => set("launcherLabel", event.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.launcherLabel}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Position</Label>
                  <select
                    value={config.position}
                    onChange={(event) => set("position", event.target.value as WidgetConfigValues["position"])}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {WIDGET_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {formatOption(position)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Panel size</Label>
                  <select
                    value={config.panelSize}
                    onChange={(event) => set("panelSize", event.target.value as WidgetConfigValues["panelSize"])}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {WIDGET_PANEL_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {formatOption(size)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Radius</Label>
                  <select
                    value={config.borderRadius}
                    onChange={(event) => set("borderRadius", event.target.value as WidgetConfigValues["borderRadius"])}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {WIDGET_BORDER_RADII.map((radius) => (
                      <option key={radius} value={radius}>
                        {formatOption(radius)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-[color:var(--card-elevated)] px-3">
                  <Label htmlFor="showPoweredBy">Powered by Supo</Label>
                  <Switch
                    id="showPoweredBy"
                    checked={config.showPoweredBy}
                    onCheckedChange={(checked) => set("showPoweredBy", checked)}
                  />
                </div>
              </div>
            </Section>

            <Section title="Copy defaults" description="Fallback text shown when the SDK does not override copy.">
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting</Label>
                <Textarea
                  id="greeting"
                  rows={3}
                  value={config.greeting}
                  onChange={(event) => set("greeting", event.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.greeting}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inputPlaceholder">Input placeholder</Label>
                <Input
                  id="inputPlaceholder"
                  value={config.inputPlaceholder}
                  onChange={(event) => set("inputPlaceholder", event.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.inputPlaceholder}
                />
              </div>
            </Section>
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90"
            >
              {saved ? "Saved" : isPending ? "Saving..." : "Save defaults"}
            </Button>
          </div>

          <div className="space-y-4">
            <CodeBlock
              title="Generated appearance object"
              code={`appearance: ${appearanceSnippet}`}
              copyId="appearance"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
            <CodeBlock
              title="Generated SupoProvider"
              code={reactSnippet}
              copyId="provider-config"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
            <CodeBlock
              title="Generated initSupo"
              code={vanillaSnippet}
              copyId="init-config"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "preview" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <section className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">Preview modes</p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm text-[color:var(--text-secondary)]">
                Identified customer
                <Switch checked={previewIdentified} onCheckedChange={setPreviewIdentified} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[color:var(--text-secondary)]">
                Hidden launcher
                <Switch checked={previewHiddenLauncher} onCheckedChange={setPreviewHiddenLauncher} />
              </label>
              <Button variant="outline" className="w-full rounded-lg" onClick={() => setPreviewIdentified(false)}>
                Reset preview
              </Button>
            </div>
            <div className="mt-5 rounded-lg border border-border bg-[color:var(--card-elevated)] p-3 font-mono text-xs text-[color:var(--text-secondary)]">
              <p>isOpen: true</p>
              <p>customer: {previewIdentified ? "identified" : "anonymous"}</p>
              <p>realtime: auto</p>
              <p>fallback: polling</p>
            </div>
          </section>
          <WidgetPreview
            config={config}
            identified={previewIdentified}
            hiddenLauncher={previewHiddenLauncher}
          />
        </div>
      ) : null}

      {activeTab === "reference" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Core", "initSupo(options) mounts the default widget and returns open, close, toggle, identify, reset, destroy, getState, and on."],
            ["React", "Use @supoapp/widget/react for SupoProvider, SupoWidget, useSupo, and useSupoState."],
            ["Headless", "Use @supoapp/widget/headless when the host app owns the full chat UI."],
            ["Identity", "Pass customer or call identify() to skip the built-in identity form and scope storage by email."],
            ["Realtime", "The SDK uses Ably when available and polling as a fallback. Set realtime: 'polling' to skip realtime."],
            ["Local dev", "Pass apiBaseUrl when testing against localhost or a self-hosted Supo deployment."],
          ].map(([title, body]) => (
            <section key={title} className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">{body}</p>
            </section>
          ))}
          <div className="md:col-span-2">
            <CodeBlock
              title="Headless client"
              code={headlessSnippet}
              copyId="headless"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "fallback" ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">Fallback embed</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
              Use this only when npm packages are unavailable, such as WordPress, Webflow,
              Shopify custom code, or a basic CMS footer field.
            </p>
          </section>
          <CodeBlock
            title="CMS script fallback"
            code={fallbackSnippet}
            copyId="fallback"
            copiedKey={copiedKey}
            onCopy={copyCode}
          />
        </div>
      ) : null}
    </div>
  );
}
