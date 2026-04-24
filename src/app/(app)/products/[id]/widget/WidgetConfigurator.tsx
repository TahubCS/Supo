"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { saveWidgetConfig, type WidgetConfigValues } from "./actions";

const ACCENT_COLORS = [
  { value: "#18181b", label: "Neutral" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f97316", label: "Orange" },
];

const PAGE_LINES = [72, 88, 55, 91, 68, 80, 60];

function WidgetPreview({
  botName,
  greeting,
  position,
  theme,
  accentColor,
}: WidgetConfigValues) {
  const isRight = position === "bottom-right";
  const isDark = theme === "dark";

  const panelBg = isDark ? "#18181b" : "#ffffff";
  const panelBorder = isDark ? "#27272a" : "#e4e4e7";
  const bubbleBg = isDark ? "#27272a" : "#f4f4f5";
  const bubbleText = isDark ? "#a1a1aa" : "#52525b";
  const inputBorder = isDark ? "#27272a" : "#e4e4e7";
  const inputText = isDark ? "#71717a" : "#a1a1aa";

  return (
    <div className="relative h-full min-h-64 overflow-hidden rounded-lg border border-border bg-[color:var(--card-elevated)]">
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
          className="mb-2 w-56 overflow-hidden rounded-xl shadow-xl"
          style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ background: accentColor }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <MessageCircle className="size-3 text-white" />
            </div>
            <span className="text-xs font-medium text-white">
              {botName || "Support"}
            </span>
          </div>

          <div className="p-3">
            <div
              className="rounded-xl px-3 py-2 text-xs leading-relaxed"
              style={{ background: bubbleBg, color: bubbleText }}
            >
              {greeting || "Hi there! How can I help you today?"}
            </div>
          </div>

          <div className="px-3 pb-3">
            <div
              className="rounded-full px-3 py-1.5 text-xs"
              style={{ border: `1px solid ${inputBorder}`, color: inputText }}
            >
              Ask a question…
            </div>
          </div>
        </div>

        <div
          className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
          style={{ background: accentColor }}
        >
          <MessageCircle className="size-5 text-white" />
        </div>
      </div>
    </div>
  );
}

interface WidgetConfiguratorProps {
  productId: string;
  initialConfig: WidgetConfigValues;
}

export function WidgetConfigurator({
  productId,
  initialConfig,
}: WidgetConfiguratorProps) {
  const [config, setConfig] = useState<WidgetConfigValues>(initialConfig);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof WidgetConfigValues, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    startTransition(async () => {
      await saveWidgetConfig(productId, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const embedCode = `<script>
  window.SupoSettings = { productId: "${productId}" };
</script>
<script src="https://cdn.supo.app/widget.js" async></script>`;

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segmentBase =
    "flex-1 px-3 py-1.5 text-xs text-center transition-colors duration-150";
  const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
  const segmentInactive =
    "text-[color:var(--text-secondary)] hover:text-foreground";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="botName"
              className="text-sm text-[color:var(--text-secondary)]"
            >
              Bot name
            </Label>
            <Input
              id="botName"
              value={config.botName}
              onChange={(e) => set("botName", e.target.value)}
              placeholder="Support"
              maxLength={32}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="greeting"
              className="text-sm text-[color:var(--text-secondary)]"
            >
              Greeting message
            </Label>
            <Textarea
              id="greeting"
              value={config.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Hi there! How can I help you today?"
              rows={3}
              maxLength={160}
              className="resize-none"
            />
            <p className="text-xs text-[color:var(--text-tertiary)]">
              {config.greeting.length}/160
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-[color:var(--text-secondary)]">
              Position
            </Label>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["bottom-right", "bottom-left"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => set("position", pos)}
                  className={`${segmentBase} ${
                    config.position === pos ? segmentActive : segmentInactive
                  }`}
                >
                  {pos === "bottom-right" ? "Bottom right" : "Bottom left"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-[color:var(--text-secondary)]">
              Theme
            </Label>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("theme", t)}
                  className={`${segmentBase} capitalize ${
                    config.theme === t ? segmentActive : segmentInactive
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-[color:var(--text-secondary)]">
              Accent color
            </Label>
            <div className="flex items-center gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => set("accentColor", c.value)}
                  className="relative flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
                  style={{ background: c.value }}
                >
                  {config.accentColor === c.value ? (
                    <Check className="size-3.5 text-white" strokeWidth={3} />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

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
              "Saving…"
            ) : (
              "Save changes"
            )}
          </Button>
        </div>

        <div className="flex flex-col">
          <p className="mb-3 text-xs text-[color:var(--text-secondary)]">
            Preview
          </p>
          <div className="flex-1">
            <WidgetPreview {...config} />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
          Embed code
        </p>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs text-[color:var(--text-secondary)]">
              Paste before the{" "}
              <code className="rounded bg-[color:var(--card-elevated)] px-1 py-0.5 font-mono text-foreground">
                &lt;/body&gt;
              </code>{" "}
              tag on every page
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
            {embedCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
