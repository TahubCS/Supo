"use client";

import { Archive, Copy, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { saveDataRetention, saveEmailChannel } from "./actions";

function Section({ icon: Icon, title, description, children }: { icon: typeof Mail; title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <Icon className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <div className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

const RETENTION_OPTIONS = [
  { value: "", label: "Keep forever" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "730", label: "2 years" },
];

export function ChannelPrivacySettings({
  productId,
  emailConfigured,
  email,
  retentionDays,
  canEditRetention,
}: {
  productId: string;
  emailConfigured: boolean;
  email: { enabled: boolean; fromName: string; address: string | null } | null;
  retentionDays: number | null;
  canEditRetention: boolean;
}) {
  const [enabled, setEnabled] = useState(email?.enabled ?? false);
  const [fromName, setFromName] = useState(email?.fromName ?? "");
  const [address, setAddress] = useState(email?.address ?? null);
  const [retention, setRetention] = useState(retentionDays === null ? "" : String(retentionDays));
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Section
        icon={Mail}
        title="Email channel"
        description={
          emailConfigured ? (
            <>
              Turn emails into conversations. Forward your support mailbox (for example <code>support@yourcompany.com</code>) to the
              address below. New emails go straight to your team with SLAs and routing, and agent replies are sent back by email
              in the same thread.
            </>
          ) : (
            <>
              Not set up on this server yet. Add a receiving domain in Resend, point its <code>email.received</code> webhook at{" "}
              <code>/api/inbound/email</code>, then set <code>INBOUND_EMAIL_DOMAIN</code> and <code>RESEND_WEBHOOK_SECRET</code>.
            </>
          )
        }
      >
        {emailConfigured && (
          <div className="space-y-4">
            {address && (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">{address}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(address);
                    toast.success("Address copied");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <label className="space-y-1.5">
                <span className="block text-xs text-[color:var(--text-secondary)]">Sender name in replies</span>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Acme Support" className="h-8 w-56" />
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-sm text-foreground">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                Receive email
              </label>
              <Button
                size="sm"
                className="ml-auto"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await saveEmailChannel(productId, { enabled, fromName });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    setAddress(result.address);
                    toast.success(enabled ? "Email channel is on" : "Email channel saved");
                  })
                }
              >
                {address ? "Save" : "Create address"}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        icon={Archive}
        title="Data retention"
        description="Resolved conversations older than this are deleted automatically (messages, ratings and webhook logs included), and customers left with no conversations are removed. Open conversations are never deleted."
      >
        <div className="flex items-center gap-3">
          <select
            aria-label="Retention period"
            value={retention}
            disabled={!canEditRetention}
            onChange={(e) => setRetention(e.target.value)}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {canEditRetention ? (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const days = retention ? Number(retention) : null;
                  if (days && !confirm(`Resolved conversations older than ${days} days will be permanently deleted. Continue?`)) return;
                  const result = await saveDataRetention(productId, days);
                  if (!result.ok) toast.error(result.error);
                  else toast.success("Retention saved");
                })
              }
            >
              Save
            </Button>
          ) : (
            <span className="text-xs text-[color:var(--text-tertiary)]">Only product admins can change this.</span>
          )}
        </div>
      </Section>
    </>
  );
}
