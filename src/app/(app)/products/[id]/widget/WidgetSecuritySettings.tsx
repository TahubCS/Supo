"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { saveWidgetAllowedOrigins } from "./actions";

export function WidgetSecuritySettings({
  productId,
  initialAllowedOrigins,
}: {
  productId: string;
  initialAllowedOrigins: string[];
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
    <section className="mt-8 rounded-lg border border-border bg-card p-5">
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
  );
}
