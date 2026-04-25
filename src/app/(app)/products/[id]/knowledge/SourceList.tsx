"use client";

import { formatDistanceToNow } from "date-fns";
import { BookOpen, FileText, Github, Globe, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { deleteSource, reindexSource } from "./actions";

type Source = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  lastCheckedAt: Date | null;
  updatedAt: Date;
};

function SourceIcon({ type }: { type: string }) {
  if (type === "url" || type === "sitemap") return <Globe className="size-4 text-[color:var(--text-secondary)]" />;
  if (type === "github") return <Github className="size-4 text-[color:var(--text-secondary)]" />;
  return <FileText className="size-4 text-[color:var(--text-secondary)]" />;
}

function StatusBadge({ status, errorMessage }: { status: string; errorMessage: string | null }) {
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
  if (status === "error") {
    return (
      <span
        title={errorMessage ?? undefined}
        className="rounded-full bg-[color:var(--status-error)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--status-error)]"
      >
        Error
      </span>
    );
  }
  return null;
}

function SourceCard({ source }: { source: Source }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteSource(source.id);
      router.refresh();
    });
  }

  function handleReindex() {
    startTransition(async () => {
      await reindexSource(source.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors duration-200 hover:bg-[color:var(--card-elevated)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SourceIcon type={source.type} />
          <span className="truncate text-sm font-medium text-foreground">{source.name}</span>
        </div>
        {source.type === "sitemap" ? (
          <span className="shrink-0 flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
            <RotateCcw className="size-2.5" />
            Auto-sync
          </span>
        ) : (
          <span className="shrink-0 rounded border border-border bg-[color:var(--card-elevated)] px-1.5 py-0.5 text-[10px] capitalize text-[color:var(--text-secondary)]">
            {source.type}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge status={source.status} errorMessage={source.errorMessage} />
        {source.status === "indexed" && (
          <span className="text-xs text-[color:var(--text-tertiary)]">
            {source.chunkCount} chunk{source.chunkCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[color:var(--text-tertiary)]">
          {source.lastCheckedAt
            ? `Synced ${formatDistanceToNow(source.lastCheckedAt, { addSuffix: true })}`
            : formatDistanceToNow(source.updatedAt, { addSuffix: true })}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={handleReindex}
            title="Re-index"
            className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={handleDelete}
            title="Delete"
            className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--status-error)]"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
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
          Add articles, URLs, or a GitHub repo so the AI can answer customer questions accurately.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((s) => (
        <SourceCard key={s.id} source={s} />
      ))}
    </div>
  );
}
