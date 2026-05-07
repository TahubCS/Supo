"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";

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

const ACCENT_COLORS = [
  { value: "#18181b", label: "Neutral" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f97316", label: "Orange" },
];

const PAGE_LINES = [72, 88, 55, 91, 68, 80, 60];

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

type MainTab = "defaults" | "developer";
type IntegrationTab = "html" | "nextjs" | "react" | "cms";

function formatOption(value: string) {
  return value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function WidgetPreview(config: WidgetConfigValues) {
  const isRight = config.position === "bottom-right";
  const isDark = config.theme === "dark";

  const panelBg = isDark ? "#18181b" : "#ffffff";
  const panelBorder = isDark ? "#27272a" : "#e4e4e7";
  const bubbleBg = isDark ? "#27272a" : "#f4f4f5";
  const bubbleText = isDark ? "#a1a1aa" : "#52525b";
  const inputBorder = isDark ? "#27272a" : "#e4e4e7";
  const inputText = isDark ? "#71717a" : "#a1a1aa";
  const panelWidth = Math.round(PANEL_WIDTHS[config.panelSize] * 0.72);
  const panelRadius = PANEL_RADII[config.borderRadius];
  const launcherRadius = config.borderRadius === "square" ? 8 : 999;

  return (
    <div className="relative h-full min-h-[34rem] overflow-hidden rounded-lg border border-border bg-[color:var(--card-elevated)]">
      <div className="space-y-2 p-6">
        {PAGE_LINES.map((w, i) => (
          <div
            key={i}
            className="h-2 rounded-full bg-border opacity-60"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>

      <div
        className={`absolute bottom-4 flex flex-col items-${isRight ? "end" : "start"}`}
        style={{ [isRight ? "right" : "left"]: "16px" }}
      >
        <div
          className="mb-2 overflow-hidden shadow-xl"
          style={{
            width: panelWidth,
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: panelRadius,
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ background: config.accentColor }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <MessageCircle className="size-3 text-white" />
            </div>
            <span className="block min-w-0 flex-1 truncate text-xs font-medium text-white">
              {config.botName}
            </span>
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
            <div>
              <p
                className="text-xs font-medium"
                style={{ color: isDark ? "#e4e4e7" : "#18181b" }}
              >
                {config.introTitle}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: bubbleText }}>
                {config.introDescription}
              </p>
            </div>
          </div>

          <div className="px-3 pb-3">
            <div
              className="px-3 py-1.5 text-xs"
              style={{
                border: `1px solid ${inputBorder}`,
                color: inputText,
                borderRadius: Math.max(panelRadius - 4, 2),
              }}
            >
              {config.inputPlaceholder}
            </div>
          </div>

          {config.showPoweredBy ? (
            <div className="pb-2 text-center text-[10px]" style={{ color: inputText }}>
              Powered by Supo
            </div>
          ) : null}
        </div>

        <div
          className="flex h-10 items-center justify-center gap-2 px-3 shadow-lg"
          style={{
            minWidth: config.launcherStyle === "icon-label" ? 112 : 40,
            borderRadius: launcherRadius,
            background: config.accentColor,
          }}
        >
          <MessageCircle className="size-5 text-white" />
          {config.launcherStyle === "icon-label" ? (
            <span className="truncate text-xs font-medium text-white">
              {config.launcherLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
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
}: {
  code: string;
  copyId: string;
  copiedKey: string | null;
  onCopy: (key: string, code: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-end border-b border-border px-4 py-2.5">
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

interface WidgetConfiguratorProps {
  productId: string;
  initialConfig: WidgetConfigValues;
  widgetUrl: string;
}

export function WidgetConfigurator({
  productId,
  initialConfig,
  widgetUrl,
}: WidgetConfiguratorProps) {
  const [config, setConfig] = useState<WidgetConfigValues>(initialConfig);
  const [saved, setSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("defaults");
  const [activeSnippet, setActiveSnippet] = useState<IntegrationTab>("nextjs");
  const [isPending, startTransition] = useTransition();

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

  const copyCode = async (key: string, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const segmentBase =
    "flex-1 px-3 py-1.5 text-center text-xs transition-colors duration-150";
  const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
  const segmentInactive =
    "text-[color:var(--text-secondary)] hover:text-foreground";
  const segmentClass = (active: boolean) =>
    `${segmentBase} ${active ? segmentActive : segmentInactive}`;

  const serverDefaultsJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const typeSnippet = `type SupoCustomer = { name: string; email: string };

type SupoSettings = {
  productId: string;
  apiUrl?: string;
  customer?: SupoCustomer | (() => SupoCustomer | null);
  appearance?: {
    theme?: "dark" | "light";
    position?: "bottom-right" | "bottom-left";
    accentColor?: \`#\${string}\`;
    launcherLabel?: string;
    launcherStyle?: "icon" | "icon-label";
    panelSize?: "compact" | "standard" | "wide";
    borderRadius?: "soft" | "rounded" | "square";
    botName?: string;
    greeting?: string;
    introTitle?: string;
    introDescription?: string;
    inputPlaceholder?: string;
    agentHandoffLabel?: string;
    showPoweredBy?: boolean;
  };
  behavior?: {
    startOpen?: boolean;
    hideLauncher?: boolean;
  };
  hooks?: {
    onReady?: () => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: { message: string }) => void;
    onEscalationChange?: (status: "pending" | "active" | null) => void;
  };
};

type SupoRuntime = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  identify: (customer: SupoCustomer) => boolean;
  reset: () => void;
};

declare global {
  interface Window {
    SupoSettings?: SupoSettings;
    Supo?: SupoRuntime;
  }
}`;

  const runtimeSnippet = `window.Supo?.open();
window.Supo?.identify({ name: "Jane Smith", email: "jane@example.com" });
window.Supo?.toggle();
window.Supo?.reset();

window.addEventListener("supo:ready", () => {
  console.log("Supo widget is ready");
});

window.addEventListener("supo:escalation-change", (event) => {
  console.log("Handoff status", event.detail.status);
});`;

  const snippets: Record<IntegrationTab, string> = {
    html: `<script>
  window.SupoSettings = {
    productId: "${productId}",
    appearance: {
      theme: "dark",
      accentColor: "#18181b",
      launcherStyle: "icon-label",
      launcherLabel: "Support"
    },
    behavior: {
      startOpen: false,
      hideLauncher: false
    },
    hooks: {
      onReady: function () {
        console.log("Supo is ready");
      }
    }
  };
</script>
<script src="${widgetUrl}" async></script>`,

    nextjs: `// app/SupoWidget.tsx
"use client";

import { useEffect } from "react";
import Script from "next/script";

export function SupoWidget({ user }: { user?: { name: string; email: string } }) {
  const settings = {
    productId: "${productId}",
    customer: user ? { name: user.name, email: user.email } : undefined,
    appearance: {
      theme: "dark",
      accentColor: "#18181b",
      launcherStyle: "icon-label",
      launcherLabel: "Support"
    }
  };

  useEffect(() => {
    const onEscalation = (event: Event) => {
      console.log("Supo handoff status", (event as CustomEvent).detail.status);
    };
    window.addEventListener("supo:escalation-change", onEscalation);
    return () => window.removeEventListener("supo:escalation-change", onEscalation);
  }, []);

  return (
    <>
      <Script
        id="supo-settings"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: \`window.SupoSettings = \${JSON.stringify(settings)};\`,
        }}
      />
      <Script src="${widgetUrl}" strategy="afterInteractive" />
    </>
  );
}`,

    react: `// SupoWidgetLoader.tsx
import { useEffect } from "react";

export function SupoWidgetLoader({ user }: { user?: { name: string; email: string } }) {
  useEffect(() => {
    window.SupoSettings = {
      productId: "${productId}",
      customer: user ? { name: user.name, email: user.email } : undefined,
      appearance: {
        theme: "dark",
        position: "bottom-right",
        accentColor: "#18181b",
        panelSize: "standard"
      },
      behavior: {
        startOpen: false
      }
    };

    if (!document.getElementById("supo-widget-script")) {
      const script = document.createElement("script");
      script.id = "supo-widget-script";
      script.src = "${widgetUrl}";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [user]);

  return null;
}`,

    cms: `<!-- Paste this in the footer/custom-code area. -->
<script>
  window.SupoSettings = {
    productId: "${productId}",
    appearance: {
      launcherStyle: "icon-label",
      launcherLabel: "Support"
    }
  };
</script>
<script src="${widgetUrl}" async></script>`,
  };

  const integrationTabs: { id: IntegrationTab; label: string }[] = [
    { id: "nextjs", label: "Next.js" },
    { id: "react", label: "React/Vite" },
    { id: "html", label: "HTML" },
    { id: "cms", label: "CMS" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setMainTab("defaults")}
          className={segmentClass(mainTab === "defaults")}
        >
          Defaults
        </button>
        <button
          type="button"
          onClick={() => setMainTab("developer")}
          className={segmentClass(mainTab === "developer")}
        >
          Developer
        </button>
      </div>

      {mainTab === "defaults" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[440px_1fr]">
          <div className="space-y-4">
            <Section
              title="Brand"
              description="Saved product-wide defaults. Developers can override these at runtime from their own codebase."
            >
              <div className="space-y-2">
                <Label htmlFor="botName" className="text-sm text-[color:var(--text-secondary)]">
                  Bot name
                </Label>
                <Input
                  id="botName"
                  value={config.botName}
                  onChange={(e) => set("botName", e.target.value)}
                  placeholder="Support"
                  maxLength={WIDGET_CONFIG_LIMITS.botName}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">Theme</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_THEMES.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => set("theme", theme)}
                      className={`${segmentClass(config.theme === theme)} capitalize`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">
                  Accent color
                </Label>
                <div className="flex items-center gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.label}
                      onClick={() => set("accentColor", color.value)}
                      className="relative flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
                      style={{ background: color.value }}
                    >
                      {config.accentColor === color.value ? (
                        <Check className="size-3.5 text-white" strokeWidth={3} />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section
              title="Launcher"
              description="Controls where the hosted launcher appears when no runtime override is provided."
            >
              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">Position</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_POSITIONS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      onClick={() => set("position", position)}
                      className={segmentClass(config.position === position)}
                    >
                      {formatOption(position)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">
                  Launcher style
                </Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_LAUNCHER_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => set("launcherStyle", style)}
                      className={segmentClass(config.launcherStyle === style)}
                    >
                      {style === "icon" ? "Icon" : "Icon + label"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="launcherLabel"
                  className="text-sm text-[color:var(--text-secondary)]"
                >
                  Launcher label
                </Label>
                <Input
                  id="launcherLabel"
                  value={config.launcherLabel}
                  onChange={(e) => set("launcherLabel", e.target.value)}
                  placeholder="Support"
                  maxLength={WIDGET_CONFIG_LIMITS.launcherLabel}
                />
              </div>
            </Section>

            <Section
              title="Panel"
              description="Controls the default size and shape of the chat surface."
            >
              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">Size</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_PANEL_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => set("panelSize", size)}
                      className={segmentClass(config.panelSize === size)}
                    >
                      {formatOption(size)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-[color:var(--text-secondary)]">Radius</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {WIDGET_BORDER_RADII.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => set("borderRadius", radius)}
                      className={segmentClass(config.borderRadius === radius)}
                    >
                      {formatOption(radius)}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section
              title="Copy"
              description="Saved fallback customer-facing text inside the hosted widget."
            >
              <div className="space-y-2">
                <Label htmlFor="greeting" className="text-sm text-[color:var(--text-secondary)]">
                  Greeting message
                </Label>
                <Textarea
                  id="greeting"
                  value={config.greeting}
                  onChange={(e) => set("greeting", e.target.value)}
                  placeholder="Hi there! How can I help you today?"
                  rows={3}
                  maxLength={WIDGET_CONFIG_LIMITS.greeting}
                  className="resize-none"
                />
                <p className="text-xs text-[color:var(--text-tertiary)]">
                  {config.greeting.length}/{WIDGET_CONFIG_LIMITS.greeting}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="introTitle" className="text-sm text-[color:var(--text-secondary)]">
                  Intro title
                </Label>
                <Input
                  id="introTitle"
                  value={config.introTitle}
                  onChange={(e) => set("introTitle", e.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.introTitle}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="introDescription"
                  className="text-sm text-[color:var(--text-secondary)]"
                >
                  Intro description
                </Label>
                <Textarea
                  id="introDescription"
                  value={config.introDescription}
                  onChange={(e) => set("introDescription", e.target.value)}
                  rows={2}
                  maxLength={WIDGET_CONFIG_LIMITS.introDescription}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="inputPlaceholder"
                  className="text-sm text-[color:var(--text-secondary)]"
                >
                  Input placeholder
                </Label>
                <Input
                  id="inputPlaceholder"
                  value={config.inputPlaceholder}
                  onChange={(e) => set("inputPlaceholder", e.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.inputPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="agentHandoffLabel"
                  className="text-sm text-[color:var(--text-secondary)]"
                >
                  Handoff button label
                </Label>
                <Input
                  id="agentHandoffLabel"
                  value={config.agentHandoffLabel}
                  onChange={(e) => set("agentHandoffLabel", e.target.value)}
                  maxLength={WIDGET_CONFIG_LIMITS.agentHandoffLabel}
                />
              </div>
            </Section>

            <Section
              title="Footer"
              description="Controls optional Supo attribution. The beta notice remains visible during alpha."
            >
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-[color:var(--card-elevated)] p-3">
                <div>
                  <Label htmlFor="showPoweredBy" className="text-sm text-foreground">
                    Show powered by Supo
                  </Label>
                  <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                    Hides only the footer attribution, not the beta testing notice.
                  </p>
                </div>
                <Switch
                  id="showPoweredBy"
                  checked={config.showPoweredBy}
                  onCheckedChange={(checked) => set("showPoweredBy", checked)}
                />
              </div>
            </Section>

            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90"
            >
              {saved ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5" />
                  Saved
                </span>
              ) : isPending ? (
                "Saving..."
              ) : (
                "Save defaults"
              )}
            </Button>
          </div>

          <div className="flex flex-col">
            <p className="mb-3 text-xs text-[color:var(--text-secondary)]">Preview</p>
            <div className="sticky top-8">
              <WidgetPreview {...config} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">Runtime contract</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
              The hosted widget loads these saved defaults, then applies values from
              `window.SupoSettings`. Runtime overrides stay in the customer app and do not
              write back to Supo.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                "Saved defaults come from this Widget page.",
                "Runtime appearance overrides win per page load.",
                "Customer identity can be passed from the host app.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-3 text-xs leading-relaxed text-[color:var(--text-secondary)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Framework snippet</p>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Choose the install shape closest to the customer codebase.
              </p>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {integrationTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSnippet(tab.id)}
                  className={segmentClass(activeSnippet === tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <CodeBlock
              code={snippets[activeSnippet]}
              copyId={`snippet-${activeSnippet}`}
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">TypeScript contract</p>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Drop this into the customer app if they want typed `window.SupoSettings`
                and `window.Supo`.
              </p>
            </div>
            <CodeBlock
              code={typeSnippet}
              copyId="types"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Runtime controls and events</p>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Use these when the host app owns the help button, user identity, or analytics.
              </p>
            </div>
            <CodeBlock
              code={runtimeSnippet}
              copyId="runtime"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Server defaults JSON</p>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                This is the current saved configuration the hosted widget loads before runtime
                overrides.
              </p>
            </div>
            <CodeBlock
              code={serverDefaultsJson}
              copyId="server-defaults"
              copiedKey={copiedKey}
              onCopy={copyCode}
            />
          </section>
        </div>
      )}
    </div>
  );
}
