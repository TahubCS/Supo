"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Library, Search } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  addConfluenceSource,
  disconnectConfluence,
  getConfluenceConnection,
  listConfluenceSpaceOptions,
  type ConfluenceConnection,
  type ConfluenceSpaceOption,
} from "./actions";

const labelClass = "text-xs text-[color:var(--text-secondary)]";
const hintClass = "text-xs text-[color:var(--text-tertiary)]";
const primaryButton = "w-full rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90";

function ConnectCard({ title, body, connectUrl, action }: { title: string; body: string; connectUrl: string; action: string }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className={hintClass}>{body}</p>
      </div>
      <Button asChild className={primaryButton}>
        <a href={connectUrl}>
          <Library className="size-3.5" />
          {action}
        </a>
      </Button>
    </div>
  );
}

export function ConfluenceSourceForm({ productId, onAdded }: { productId: string; onAdded: () => void }) {
  const [connection, setConnection] = useState<ConfluenceConnection | null>(null);
  const [cloudId, setCloudId] = useState<string | null>(null);
  // Spaces of the site they were loaded for; a stale list never shows for another site.
  const [loaded, setLoaded] = useState<{ cloudId: string; spaces: ConfluenceSpaceOption[] } | null>(null);
  const spaces = loaded && loaded.cloudId === cloudId ? loaded.spaces : null;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ConfluenceSpaceOption | null>(null);
  const [name, setName] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getConfluenceConnection(productId)
      .then((next) => {
        if (cancelled) return;
        setConnection(next);
        setCloudId(next.sites[0]?.cloudId ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load Confluence");
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    if (!cloudId) return;
    let cancelled = false;
    listConfluenceSpaceOptions(productId, cloudId)
      .then((next) => {
        if (!cancelled) setLoaded({ cloudId, spaces: next });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoaded({ cloudId, spaces: [] });
        toast.error(error instanceof Error ? error.message : "Could not load Confluence spaces");
      });
    return () => {
      cancelled = true;
    };
  }, [productId, cloudId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (spaces ?? [])
      .filter((space) => !q || space.name.toLowerCase().includes(q) || space.key.toLowerCase().includes(q))
      .slice(0, 100);
  }, [spaces, query]);

  function submit() {
    if (!selected || !cloudId) return;
    startTransition(async () => {
      try {
        await addConfluenceSource(productId, { cloudId, spaceId: selected.id, name: name.trim() });
        toast.success(`${selected.name} added — indexing has started`);
        onAdded();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add space");
      }
    });
  }

  function disconnect() {
    startTransition(async () => {
      try {
        await disconnectConfluence(productId);
        toast.success("Confluence disconnected");
        setConnection((current) => current && { ...current, status: "disconnected", sites: [] });
        setCloudId(null);
        setLoaded(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not disconnect Confluence");
      }
    });
  }

  if (!connection) return <p className={hintClass}>Loading Confluence…</p>;

  if (!connection.configured || !connection.connectUrl) {
    return <p className={hintClass}>Confluence is not configured on this server.</p>;
  }

  if (connection.status === "disconnected") {
    return (
      <ConnectCard
        title="Connect Confluence"
        body="Sign in with Atlassian and approve read-only access to Confluence pages and spaces. You choose which spaces to add next; pages are re-synced daily."
        connectUrl={connection.connectUrl}
        action="Connect Confluence"
      />
    );
  }

  if (connection.status === "reauth_required") {
    return (
      <ConnectCard
        title="Reconnect Confluence"
        body="Atlassian no longer accepts this workspace's Confluence access (it was revoked or expired). Reconnect to keep your Confluence sources syncing."
        connectUrl={connection.connectUrl}
        action="Reconnect Confluence"
      />
    );
  }

  const site = connection.sites.find((candidate) => candidate.cloudId === cloudId);

  const footer = (
    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
      <a href={connection.connectUrl} className={`${hintClass} underline`}>
        Use a different Atlassian account
      </a>
      {connection.canDisconnect && (
        <button type="button" className={`${hintClass} underline`} onClick={() => setConfirmDisconnect(true)}>
          Disconnect
        </button>
      )}
      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Confluence?</AlertDialogTitle>
            <AlertDialogDescription>
              Supo deletes its Atlassian access and removes every Confluence source from all products in this workspace.
              The AI immediately stops using that content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (!site) {
    return (
      <div className="space-y-3">
        <p className={hintClass}>
          The connected Atlassian account can&apos;t read Confluence on any site. Connect an account that has Confluence
          access.
        </p>
        {footer}
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="min-w-0 space-y-3">
        {connection.sites.length > 1 && (
          <Select value={site.cloudId} onValueChange={setCloudId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connection.sites.map((option) => (
                <SelectItem key={option.cloudId} value={option.cloudId}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
          <Input placeholder={`Search spaces on ${site.name}`} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-lg border border-border">
          {spaces === null && <p className={`${hintClass} p-3`}>Loading spaces…</p>}
          {spaces !== null && filtered.length === 0 && <p className={`${hintClass} p-3`}>No spaces found.</p>}
          {filtered.map((space) => (
            <button
              key={space.id}
              type="button"
              disabled={space.alreadyAdded}
              onClick={() => {
                setSelected(space);
                setName(space.name);
              }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-[color:var(--card-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{space.name}</span>
              <span className={`${hintClass} font-mono`}>{space.key}</span>
              {space.alreadyAdded && <span className={hintClass}>Added</span>}
            </button>
          ))}
        </div>
        <p className={hintClass}>Spaces are listed with the access of the Atlassian account that connected Confluence.</p>
        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-[color:var(--card-elevated)] px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground">
          <Library className="size-3.5 shrink-0" />
          <span className="truncate">{selected.name}</span>
          <span className={`${hintClass} font-mono`}>{selected.key}</span>
        </span>
        <button type="button" className={`${hintClass} underline`} onClick={() => setSelected(null)}>
          Change
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confluence-name" className={labelClass}>Name</Label>
        <Input id="confluence-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </div>

      <p className={hintClass}>
        Every current page in this space is indexed and re-synced daily. The AI can quote these pages in answers to
        customers, so add only spaces whose content is fine to share. Citations show page titles without links, since
        customers can&apos;t open your Confluence.
      </p>

      <Button onClick={submit} disabled={isPending || !name.trim()} className={primaryButton}>
        {isPending ? "Adding…" : "Add & index"}
      </Button>
    </div>
  );
}
