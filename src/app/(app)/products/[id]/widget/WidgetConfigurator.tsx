"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

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
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-white">
                {config.botName}
              </span>
            </div>
          </div>

          <div className="border-b px-3 py-2 text-[10px] leading-relaxed" style={{
            borderColor: panelBorder,
            background: isDark ? "#241f13" : "#fffbeb",
            color: isDark ? "#facc15" : "#92400e",
          }}>
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
              <p className="text-xs font-medium" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
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
            <span className="truncate text-xs font-medium text-white">{config.launcherLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface WidgetConfiguratorProps {
  productId: string;
  initialConfig: WidgetConfigValues;
  widgetUrl: string;
}

type IntegrationTab = "html" | "nextjs" | "react" | "cms";

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

export function WidgetConfigurator({
  productId,
  initialConfig,
  widgetUrl,
}: WidgetConfiguratorProps) {
  const [config, setConfig] = useState<WidgetConfigValues>(initialConfig);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<IntegrationTab>("html");
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

  const TABS: { id: IntegrationTab; label: string }[] = [
    { id: "html", label: "HTML" },
    { id: "nextjs", label: "Next.js" },
    { id: "react", label: "React/Vite" },
    { id: "cms", label: "CMS" },
  ];

  const snippets: Record<IntegrationTab, string> = {
    html: `<!-- Place once before </body> on every page where support should be available. -->
<script>
  window.SupoSettings = {
    productId: "${productId}"
  };
</script>
<script src="${widgetUrl}" async></script>`,

    nextjs: `// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Load once in the root layout. Do not add this on every route/page. */}
        <Script id="supo-settings" strategy="beforeInteractive">
          {\`window.SupoSettings = { productId: "${productId}" };\`}
        </Script>
        <Script src="${widgetUrl}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`,

    react: `// SupoWidgetLoader.tsx
import { useEffect } from 'react';

export function SupoWidgetLoader() {
  useEffect(() => {
    if (document.getElementById('supo-widget-script')) return;

    (window as Window & { SupoSettings?: { productId: string } }).SupoSettings = {
      productId: '${productId}'
    };

    const s = document.createElement('script');
    s.id = 'supo-widget-script';
    s.src = '${widgetUrl}';
    s.async = true;
    document.body.appendChild(s);

    return () => {
      // Keep the script mounted if your app uses client-side routing.
    };
  }, []);

  return null;
}`,

    cms: `<!-- Add this in your site footer/custom code area. Load it once per page. -->
<script>
  window.SupoSettings = {
    productId: "${productId}"
  };
</script>
<script src="${widgetUrl}" async></script>`,
  };

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segmentBase =
    "flex-1 px-3 py-1.5 text-center text-xs transition-colors duration-150";
  const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
  const segmentInactive =
    "text-[color:var(--text-secondary)] hover:text-foreground";

  const segmentClass = (active: boolean) =>
    `${segmentBase} ${active ? segmentActive : segmentInactive}`;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[440px_1fr]">
        <div className="space-y-4">
          <Section
            title="Brand"
            description="Controls the widget identity and the main color used by buttons and headers."
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
            description="Controls where the widget opens from and whether the launcher shows text."
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
            description="Controls the size and shape of the chat surface."
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
            description="Controls customer-facing text inside the hosted widget."
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
              "Save changes"
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

      <div>
        <p className="mb-1 text-sm font-semibold text-foreground">Integration</p>
        <p className="mb-4 text-xs text-[color:var(--text-secondary)]">
          Add the widget to your site. Works with any framework or plain HTML.
        </p>

        <p className="mb-4 text-xs text-[color:var(--text-tertiary)]">
          The hosted widget is currently in beta testing and may be unstable.
        </p>

        <div className="mb-3 flex overflow-hidden rounded-lg border border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setCopied(false);
              }}
              className={`${segmentBase} ${activeTab === tab.id ? segmentActive : segmentInactive}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs text-[color:var(--text-secondary)]">
              {activeTab === "html" && "Paste before the </body> tag on every page"}
              {activeTab === "nextjs" && "Add to app/layout.tsx using next/script"}
              {activeTab === "react" && "Mount once near your app root"}
              {activeTab === "cms" && "Add to your footer/custom code area"}
            </p>
            <button
              type="button"
              onClick={copyEmbed}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--card-elevated)] hover:text-foreground"
            >
              {copied ? (
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
            {snippets[activeTab]}
          </pre>
        </div>
      </div>
    </div>
  );
}
