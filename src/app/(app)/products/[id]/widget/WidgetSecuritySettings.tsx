"use client";

import { Copy, KeyRound, ShieldCheck, Timer } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IdentityVerificationMode } from "@/lib/widget-identity";

import { rotateIdentitySecret, saveWidgetAllowedOrigins, saveWidgetHandoffSettings } from "./actions";

const IDENTITY_MODES: { id: IdentityVerificationMode; label: string; description: string }[] = [
  { id: "off", label: "Off", description: "Anyone can chat by entering an email." },
  {
    id: "optional",
    label: "Optional",
    description: "Verified users resume their conversations; unverified users start new ones.",
  },
  { id: "required", label: "Required", description: "Every request must include a valid userHash." },
];

function HandoffAndIdentitySettings({
  productId,
  initialHandoffTimeoutSec,
  initialIdentityVerification,
  hasIdentitySecret,
}: {
  productId: string;
  initialHandoffTimeoutSec: number;
  initialIdentityVerification: IdentityVerificationMode;
  hasIdentitySecret: boolean;
}) {
  const [minutes, setMinutes] = useState(Math.round(initialHandoffTimeoutSec / 60) || 5);
  const [mode, setMode] = useState<IdentityVerificationMode>(initialIdentityVerification);
  const [secret, setSecret] = useState<string | null>(null);
  const [hasSecret, setHasSecret] = useState(hasIdentitySecret);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveWidgetHandoffSettings(productId, {
        handoffTimeoutSec: minutes * 60,
        identityVerification: mode,
      });
      if (result.ok) toast.success("Handoff settings saved");
      else toast.error(result.error);
    });
  }

  function handleRotate() {
    startTransition(async () => {
      try {
        setSecret(await rotateIdentitySecret(productId));
        setHasSecret(true);
        toast.success("New identity secret generated. Update your backend before enabling verification.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not generate a secret");
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <Timer className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
        <div>
          <p className="text-sm font-medium text-foreground">Human handoff</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
            Customers are handed to your team when they ask for a person, get frustrated, or the AI can&apos;t answer
            twice in a row. If nobody joins within the wait time, they are told you&apos;ll follow up by email and your
            team is emailed.
          </p>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="handoff-wait" className="text-xs text-[color:var(--text-secondary)]">
            Wait time before email follow-up (minutes)
          </Label>
          <Input
            id="handoff-wait"
            type="number"
            min={1}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="w-28"
          />
        </div>
      </div>

      <div className="mt-6 mb-3 flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
        <div>
          <p className="text-sm font-medium text-foreground">Identity verification</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
            Your backend signs each logged-in user with{" "}
            <code>HMAC-SHA256(secret, externalId ?? email)</code> and passes it as <code>customer.userHash</code>.
            This stops people from impersonating your users in the widget.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {IDENTITY_MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMode(option.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              mode === option.id ? "border-foreground bg-[color:var(--card-elevated)]" : "border-border hover:bg-[color:var(--card-elevated)]"
            }`}
          >
            <p className="text-xs font-medium text-foreground">{option.label}</p>
            <p className="mt-1 text-[11px] leading-snug text-[color:var(--text-secondary)]">{option.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleRotate} disabled={isPending} className="text-xs">
          {hasSecret ? "Rotate secret" : "Generate secret"}
        </Button>
        {secret ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              toast.success("Secret copied");
            }}
            className="flex max-w-full items-center gap-1.5 truncate rounded border border-border px-2 py-1 font-mono text-[11px] text-foreground"
            title="Copy secret"
          >
            <Copy className="size-3 shrink-0" />
            <span className="truncate">{secret}</span>
          </button>
        ) : (
          <span className="text-[11px] text-[color:var(--text-tertiary)]">
            {hasSecret ? "A secret is configured. It is only shown when generated." : "No secret yet."}
          </span>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </section>
  );
}

export function WidgetSecuritySettings({
  productId,
  initialAllowedOrigins,
  initialHandoffTimeoutSec,
  initialIdentityVerification,
  hasIdentitySecret,
}: {
  productId: string;
  initialAllowedOrigins: string[];
  initialHandoffTimeoutSec: number;
  initialIdentityVerification: IdentityVerificationMode;
  hasIdentitySecret: boolean;
}) {
  const [value, setValue] = useState(initialAllowedOrigins.join("\n"));
  const [saved, setSaved] = useState(initialAllowedOrigins);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveWidgetAllowedOrigins(productId, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(result.origins);
      setValue(result.origins.join("\n"));
      toast.success(
        result.origins.length > 0
          ? `Widget restricted to ${result.origins.length} origin${result.origins.length === 1 ? "" : "s"}`
          : "Widget can be embedded on any site",
      );
    });
  }

  return (
    <>
    <HandoffAndIdentitySettings
      productId={productId}
      initialHandoffTimeoutSec={initialHandoffTimeoutSec}
      initialIdentityVerification={initialIdentityVerification}
      hasIdentitySecret={hasIdentitySecret}
    />
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
        <div>
          <p className="text-sm font-medium text-foreground">Allowed websites</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
            Restrict which sites can load your widget and spend your AI quota. One origin per line,
            for example <code>https://app.acme.com</code> or <code>*.acme.com</code>. Leave empty to
            allow any site.
          </p>
        </div>
      </div>
      <Label htmlFor="widget-allowed-origins" className="sr-only">
        Allowed origins
      </Label>
      <Textarea
        id="widget-allowed-origins"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={"https://www.acme.com\n*.acme.com"}
        rows={4}
        className="font-mono text-xs"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[color:var(--text-secondary)]">
          {saved.length > 0 ? `${saved.length} origin${saved.length === 1 ? "" : "s"} allowed` : "Open to all origins"}
        </p>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </section>
    </>
  );
}
