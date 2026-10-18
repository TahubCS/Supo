"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  Github,
  Globe,
  Library,
  Lock,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { KnowledgeSourceSettings } from "@/db/schema";
import { AUTO_SYNC_SOURCE_TYPES } from "@/lib/knowledge/source-types";

import {
  deleteSource,
  getSourceChunks,
  reindexSource,
  setSourceEnabled,
  updateSource,
  type SourceChunkPreview,
} from "./actions";

export type Source = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  content: string | null;
  status: string;
  enabled: boolean;
  errorMessage: string | null;
  chunkCount: number;
  pageCount: number;
  settings: KnowledgeSourceSettings | null;
  githubRepoId: number | null;
  lastCheckedAt: Date | null;
  updatedAt: Date;
};

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  conversation: "Learned answer",
  url: "Page",
  website: "Website",
  sitemap: "Website",
  github: "GitHub",
  confluence: "Confluence",
};

function SourceIcon({ type }: { type: string }) {
  const className = "size-4 shrink-0 text-[color:var(--text-secondary)]";
  if (type === "url" || type === "sitemap" || type === "website") return <Globe className={className} />;
  if (type === "github") return <Github className={className} />;
  if (type === "confluence") return <Library className={className} />;
  return <FileText className={className} />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "indexed") {
    return (
      <span className="rounded-full bg-[color:var(--status-success)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-success)]">
        Indexed
      </span>
    );
  }
  if (status === "indexing" || status === "pending") {
    return (
      <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--text-tertiary)]" />
        Indexing…
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[color:var(--status-error)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-error)]">
      Failed
    </span>
  );
}

function EditSourceDialog({
  source,
  open,
  onOpenChange,
}: {
  source: Source;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url ?? "");
  const [content, setContent] = useState(source.content ?? "");
  const [maxPages, setMaxPages] = useState(source.settings?.maxPages ?? 50);
  const [isPending, startTransition] = useTransition();
  const isText = source.type === "article" || source.type === "conversation";
  const isWebsite = source.type === "website" || source.type === "sitemap";
  // GitHub App repositories and Confluence spaces are chosen by ID, not URL.
  const hasFixedLocation = source.githubRepoId !== null || source.type === "confluence";

  function handleSave() {
    startTransition(async () => {
      try {
        await updateSource(source.id, {
          name,
          url: isText || hasFixedLocation ? undefined : url,
          content: isText ? content : undefined,
          maxPages: isWebsite ? maxPages : undefined,
        });
        toast.success("Source updated");
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update source");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Edit source</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${source.id}`} className="text-xs text-[color:var(--text-secondary)]">Name</Label>
            <Input id={`name-${source.id}`} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          {isText ? (
            <div className="space-y-1.5">
              <Label htmlFor={`content-${source.id}`} className="text-xs text-[color:var(--text-secondary)]">Content</Label>
              <Textarea
                id={`content-${source.id}`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="resize-y text-sm"
              />
            </div>
          ) : hasFixedLocation ? null : (
            <div className="space-y-1.5">
              <Label htmlFor={`url-${source.id}`} className="text-xs text-[color:var(--text-secondary)]">URL</Label>
              <Input id={`url-${source.id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          )}
          {isWebsite && (
            <div className="space-y-1.5">
              <Label htmlFor={`pages-${source.id}`} className="text-xs text-[color:var(--text-secondary)]">Maximum pages</Label>
              <Input
                id={`pages-${source.id}`}
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
              />
            </div>
          )}
          <p className="text-xs text-[color:var(--text-tertiary)]">Changing the content or URL re-indexes the source.</p>
          <Button onClick={handleSave} disabled={isPending || !name.trim()} className="w-full text-xs">
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChunkViewer({
  source,
  open,
  onOpenChange,
}: {
  source: Source;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [chunks, setChunks] = useState<SourceChunkPreview[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next && chunks === null) {
      startTransition(async () => {
        try {
          setChunks(await getSourceChunks(source.id));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not load content");
        }
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base">{source.name}</SheetTitle>
          <p className="text-xs text-[color:var(--text-secondary)]">
            What the AI can read from this source ({source.chunkCount} passages
            {source.pageCount > 1 ? ` from ${source.pageCount} pages` : ""}).
          </p>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {isPending && <p className="text-xs text-[color:var(--text-secondary)]">Loading…</p>}
          {chunks?.length === 0 && <p className="text-xs text-[color:var(--text-secondary)]">No indexed content yet.</p>}
          {chunks?.map((chunk) => (
            <div key={chunk.id} className="rounded-md border border-border p-3">
              {(chunk.title || chunk.headingPath.length > 0) && (
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-medium text-[color:var(--text-secondary)]">
                    {[chunk.title, ...chunk.headingPath].filter(Boolean).join(" > ")}
                  </p>
                  {chunk.url && (
                    <a href={chunk.url} target="_blank" rel="noreferrer" className="text-[color:var(--text-tertiary)] hover:text-foreground">
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{chunk.content}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SourceCard({ source }: { source: Source }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autoSync = AUTO_SYNC_SOURCE_TYPES.includes(source.type);
  const github = source.githubRepoId !== null ? source.settings?.github : undefined;
  const confluence = source.type === "confluence" ? source.settings?.confluence : undefined;

  function run(action: () => Promise<void>, success?: string) {
    startTransition(async () => {
      try {
        await action();
        if (success) toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors duration-200 hover:bg-[color:var(--card-elevated)] ${
        source.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourceIcon type={source.type} />
          <span className="truncate text-sm font-medium text-foreground" title={source.name}>
            {source.name}
          </span>
        </div>
        <Switch
          checked={source.enabled}
          disabled={isPending}
          onCheckedChange={(checked) =>
            run(() => setSourceEnabled(source.id, checked), checked ? "Source enabled" : "Source disabled — the AI will ignore it")
          }
          aria-label={source.enabled ? "Disable source" : "Enable source"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={source.status} />
        <span className="rounded border border-border bg-[color:var(--card-elevated)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
          {TYPE_LABELS[source.type] ?? source.type}
        </span>
        {autoSync && (
          <span className="flex items-center gap-1 text-[10px] text-[color:var(--text-tertiary)]">
            <RotateCcw className="size-2.5" />
            {github ? "Syncs on push" : "Daily sync"}
          </span>
        )}
        {source.status === "indexed" && (
          <span className="text-xs text-[color:var(--text-tertiary)]">
            {source.pageCount > 1 ? `${source.pageCount} pages · ` : ""}
            {source.chunkCount} passage{source.chunkCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {github && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[color:var(--text-tertiary)]">
          {github.private && <Lock className="size-3" />}
          <span className="truncate">{github.fullName}</span>
          <span>· {github.branch ?? "default branch"}</span>
          {github.lastCommitSha && <span className="font-mono">· {github.lastCommitSha.slice(0, 7)}</span>}
          {github.includePaths.length > 0 && <span>· {github.includePaths.join(", ")}</span>}
        </p>
      )}

      {confluence && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[color:var(--text-tertiary)]">
          <span className="truncate">{confluence.siteName}</span>
          <span>
            · {confluence.spaceName} <span className="font-mono">({confluence.spaceKey})</span>
          </span>
        </p>
      )}

      {source.errorMessage && (
        <p
          className={`flex items-start gap-1.5 text-xs ${
            source.status === "error" ? "text-[color:var(--status-error)]" : "text-[color:var(--text-secondary)]"
          }`}
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-3">{source.errorMessage}</span>
        </p>
      )}

      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-[color:var(--text-tertiary)]">
          {source.lastCheckedAt
            ? `Synced ${formatDistanceToNow(source.lastCheckedAt, { addSuffix: true })}`
            : `Updated ${formatDistanceToNow(source.updatedAt, { addSuffix: true })}`}
        </span>

        <div className="flex items-center gap-1">
          {[
            { label: "View content", icon: Eye, onClick: () => setViewing(true), disabled: source.chunkCount === 0 },
            { label: "Edit", icon: Pencil, onClick: () => setEditing(true) },
            {
              label: "Re-index now",
              icon: RefreshCw,
              onClick: () => run(() => reindexSource(source.id), "Re-indexing started"),
            },
          ].map(({ label, icon: Icon, onClick, disabled }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon"
              disabled={isPending || disabled}
              onClick={onClick}
              title={label}
              aria-label={label}
              className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-foreground"
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={() => setConfirmDelete(true)}
            title="Delete"
            aria-label="Delete"
            className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--status-error)]"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <EditSourceDialog source={source} open={editing} onOpenChange={setEditing} />
      <ChunkViewer source={source} open={viewing} onOpenChange={setViewing} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{source.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI immediately stops using this content. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => deleteSource(source.id), "Source deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <BookOpen className="mb-3 size-6 text-[color:var(--text-tertiary)]" />
        <p className="text-sm font-medium text-foreground">No sources yet</p>
        <p className="mt-1 max-w-xs text-xs text-[color:var(--text-secondary)]">
          Add articles, your help center website, a GitHub repo or a Confluence space so the AI can answer customer questions accurately.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((s) => (
        <SourceCard key={`${s.id}:${s.updatedAt.getTime()}`} source={s} />
      ))}
    </div>
  );
}
