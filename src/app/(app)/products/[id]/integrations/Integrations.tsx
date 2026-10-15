"use client";

import { formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, RotateCcw, Send, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { API_SCOPE_LABELS, API_SCOPES } from "@/lib/api/scopes";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from "@/lib/webhooks/events";

import {
  createApiKey,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listDeliveries,
  redeliver,
  revokeApiKey,
  rotateWebhookSecret,
  sendTestEvent,
  updateWebhookEndpoint,
  type DeliverySummary,
} from "./actions";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  expired: boolean;
  createdAt: Date;
};
type EndpointRow = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  createdAt: Date;
};

function Section({ icon: Icon, title, description, children }: { icon: typeof KeyRound; title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5 first:mt-0">
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

function SecretReveal({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="mb-2 text-xs font-medium text-foreground">{label} — copy it now, it won&apos;t be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">{value}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function CheckboxList<T extends string>({
  options,
  labels,
  selected,
  onChange,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-xs hover:bg-[color:var(--card-elevated)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={selected.includes(option)}
            onChange={(e) => onChange(e.target.checked ? [...selected, option] : selected.filter((s) => s !== option))}
          />
          <span>
            <span className="block font-mono text-[11px] text-foreground">{option}</span>
            <span className="text-[color:var(--text-secondary)]">{labels[option]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ApiKeys({ productId, apiBaseUrl, keys }: { productId: string; apiBaseUrl: string; keys: KeyRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<(typeof API_SCOPES)[number][]>(["conversations:read"]);
  const [expires, setExpires] = useState<string>("never");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <Section
      icon={KeyRound}
      title="API keys"
      description={
        <>
          Call the REST API at <code>{apiBaseUrl}</code> with <code>Authorization: Bearer supo_sk_…</code>. Keys only work for
          this product and only for the permissions you choose. Keys are stored hashed.
        </>
      }
    >
      {revealed && <SecretReveal label="Your new API key" value={revealed} onDone={() => setRevealed(null)} />}

      {active.length > 0 && (
        <table className="mb-4 w-full text-left text-xs">
          <thead className="text-[color:var(--text-tertiary)]">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Key</th>
              <th className="py-2 pr-3 font-medium">Permissions</th>
              <th className="py-2 pr-3 font-medium">Last used</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {active.map((key) => (
              <tr key={key.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 font-medium text-foreground">
                  {key.name}
                  {key.expiresAt && (
                    <span className="block text-[10px] font-normal text-[color:var(--text-tertiary)]">
                      {key.expired ? "Expired" : `Expires ${formatDistanceToNow(key.expiresAt, { addSuffix: true })}`}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-[11px]">{key.prefix}…</td>
                <td className="py-2 pr-3 text-[11px] text-[color:var(--text-secondary)]">{key.scopes.join(", ")}</td>
                <td className="py-2 pr-3 text-[color:var(--text-secondary)]">
                  {key.lastUsedAt ? formatDistanceToNow(key.lastUsedAt, { addSuffix: true }) : "Never"}
                </td>
                <td className="py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-500"
                    disabled={isPending}
                    onClick={() => {
                      if (!confirm(`Revoke "${key.name}"? Requests using it will fail immediately.`)) return;
                      startTransition(async () => {
                        const result = await revokeApiKey(productId, key.id);
                        if (!result.ok) toast.error(result.error);
                        else {
                          toast.success("Key revoked");
                          router.refresh();
                        }
                      });
                    }}
                  >
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Name, e.g. Zapier or CRM sync" value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" />
            <select
              aria-label="Expiry"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-xs"
            >
              <option value="never">Never expires</option>
              <option value="30">Expires in 30 days</option>
              <option value="90">Expires in 90 days</option>
              <option value="365">Expires in 1 year</option>
            </select>
          </div>
          <CheckboxList options={API_SCOPES} labels={API_SCOPE_LABELS} selected={scopes} onChange={setScopes} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending || !name.trim() || scopes.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await createApiKey(productId, {
                    name,
                    scopes,
                    expiresInDays: expires === "never" ? null : Number(expires),
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  setRevealed(result.value.key);
                  setCreating(false);
                  setName("");
                  router.refresh();
                })
              }
            >
              Create key
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          New API key
        </Button>
      )}
    </Section>
  );
}

function DeliveryLog({ productId, endpointId }: { productId: string; endpointId: string }) {
  const [rows, setRows] = useState<DeliverySummary[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        setRows(await listDeliveries(productId, endpointId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load deliveries");
      }
    });
  }

  if (rows === null) {
    return (
      <button type="button" onClick={load} disabled={isPending} className="text-xs font-medium text-foreground hover:underline">
        {isPending ? "Loading…" : "Show recent deliveries"}
      </button>
    );
  }
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Recent deliveries</p>
        <button type="button" onClick={load} className="text-xs text-[color:var(--text-secondary)] hover:text-foreground">
          Refresh
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[color:var(--text-tertiary)]">No deliveries yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => (
            <li key={row.id} className="text-xs">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} aria-label="Toggle details">
                  {expanded === row.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] ${
                    row.status === "success"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : row.status === "failed"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {row.status === "pending" && row.attempts > 0 ? "retrying" : row.status}
                </span>
                <span className="font-mono">{row.event}</span>
                <span className="text-[color:var(--text-tertiary)]">
                  {row.responseStatus ? `HTTP ${row.responseStatus}` : row.error ?? ""}
                  {row.durationMs !== null ? ` · ${row.durationMs} ms` : ""}
                </span>
                <span className="ml-auto text-[color:var(--text-tertiary)]">{formatDistanceToNow(row.createdAt, { addSuffix: true })}</span>
                <button
                  type="button"
                  aria-label="Redeliver"
                  title="Send again"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await redeliver(productId, endpointId, row.id);
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success("Queued for delivery");
                        setRows(await listDeliveries(productId, endpointId));
                      }
                    })
                  }
                  className="text-[color:var(--text-secondary)] hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
              {expanded === row.id && (
                <div className="space-y-2 border-t border-border bg-[color:var(--card-elevated)] px-3 py-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(row.payload, null, 2)}</pre>
                  {row.responseBody && (
                    <p className="font-mono text-[11px] text-[color:var(--text-secondary)]">Response: {row.responseBody}</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EndpointCard({ productId, endpoint }: { productId: string; endpoint: EndpointRow }) {
  const router = useRouter();
  const [events, setEvents] = useState(endpoint.events as (typeof WEBHOOK_EVENTS)[number][]);
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? "Something went wrong");
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-border p-4">
      {secret && <SecretReveal label="New signing secret" value={secret} onDone={() => setSecret(null)} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground">{endpoint.url}</p>
          {endpoint.description && <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">{endpoint.description}</p>}
          {endpoint.disabledReason && <p className="mt-1 text-xs text-red-500">{endpoint.disabledReason}</p>}
          {!editing && <p className="mt-1 text-[11px] text-[color:var(--text-tertiary)]">{endpoint.events.join(", ")}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={endpoint.enabled}
            disabled={isPending}
            onCheckedChange={(enabled) =>
              run(() => updateWebhookEndpoint(productId, endpoint.id, { enabled }), enabled ? "Endpoint enabled" : "Endpoint paused")
            }
            aria-label="Enabled"
          />
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => sendTestEvent(productId, endpoint.id), "Test event queued")}>
            <Send className="size-3.5" /> Test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            Events
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                if (!confirm("Rotate the signing secret? Update your receiver right away.")) return;
                const result = await rotateWebhookSecret(productId, endpoint.id);
                if (!result.ok) toast.error(result.error);
                else setSecret(result.value.secret);
              })
            }
          >
            Rotate secret
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-red-500 hover:text-red-500"
            aria-label="Delete endpoint"
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete this endpoint and its delivery log?")) run(() => deleteWebhookEndpoint(productId, endpoint.id), "Endpoint deleted");
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <CheckboxList options={WEBHOOK_EVENTS} labels={WEBHOOK_EVENT_LABELS} selected={events} onChange={setEvents} />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={isPending || events.length === 0}
              onClick={() => {
                run(() => updateWebhookEndpoint(productId, endpoint.id, { events }), "Events updated");
                setEditing(false);
              }}
            >
              Save events
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3">
        <DeliveryLog productId={productId} endpointId={endpoint.id} />
      </div>
    </div>
  );
}

function Webhooks({ productId, endpoints }: { productId: string; endpoints: EndpointRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<(typeof WEBHOOK_EVENTS)[number][]>(["conversation.escalated", "conversation.resolved"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Section
      icon={Webhook}
      title="Webhooks"
      description={
        <>
          Supo POSTs JSON to your HTTPS endpoint when things happen. Verify the <code>Supo-Signature</code> header (
          <code>t=…,v1=HMAC-SHA256(secret, &quot;t.body&quot;)</code>) and respond with 2xx. Failed deliveries are retried with
          backoff for about 5 hours; an endpoint is paused after 15 failed deliveries in a row.
        </>
      }
    >
      {secret && <SecretReveal label="Signing secret" value={secret} onDone={() => setSecret(null)} />}
      <div className="space-y-3">
        {endpoints.map((endpoint) => (
          <EndpointCard key={endpoint.id} productId={productId} endpoint={endpoint} />
        ))}
      </div>
      {creating ? (
        <div className="mt-3 space-y-3 rounded-md border border-border p-4">
          <Input placeholder="https://example.com/webhooks/supo" value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 font-mono text-xs" />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-xs" />
          <CheckboxList options={WEBHOOK_EVENTS} labels={WEBHOOK_EVENT_LABELS} selected={events} onChange={setEvents} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending || !url.trim() || events.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await createWebhookEndpoint(productId, { url, events, description });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  setSecret(result.value.secret);
                  setCreating(false);
                  setUrl("");
                  setDescription("");
                  router.refresh();
                })
              }
            >
              Add endpoint
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreating(true)}>
          Add endpoint
        </Button>
      )}
    </Section>
  );
}

export function Integrations({
  productId,
  apiBaseUrl,
  keys,
  endpoints,
}: {
  productId: string;
  apiBaseUrl: string;
  keys: KeyRow[];
  endpoints: EndpointRow[];
}) {
  return (
    <div>
      <ApiKeys productId={productId} apiBaseUrl={apiBaseUrl} keys={keys} />
      <Webhooks productId={productId} endpoints={endpoints} />
    </div>
  );
}
