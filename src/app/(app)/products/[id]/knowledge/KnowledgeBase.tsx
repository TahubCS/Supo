"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSourceStatuses, type SourceStatus } from "./actions";
import { AddSourceDialog } from "./AddSourceDialog";
import { SuggestionList, type Suggestion } from "./SuggestionList";
import { SourceList, type Source } from "./SourceList";
import { TestQueryPanel } from "./TestQueryPanel";

const POLL_INTERVAL_MS = 3000;

function isBusy(status: string) {
  return status === "indexing" || status === "pending";
}

export function KnowledgeBase({
  productId,
  sources: initialSources,
  suggestions,
}: {
  productId: string;
  sources: Source[];
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  // Live status overrides are tied to the server snapshot they were fetched
  // for, so a router.refresh() with fresh data discards them automatically.
  const [live, setLive] = useState<{ base: Source[]; byId: Record<string, SourceStatus> }>({
    base: initialSources,
    byId: {},
  });
  const sources = useMemo(() => {
    const statusById = live.base === initialSources ? live.byId : {};
    return initialSources.map((source) => ({ ...source, ...statusById[source.id] }));
  }, [initialSources, live]);
  const anyBusy = sources.some((s) => isBusy(s.status));

  // While anything is indexing, poll lightweight statuses; refresh the page
  // once a source finishes so counts and actions are up to date.
  useEffect(() => {
    if (!anyBusy) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const statuses = await getSourceStatuses(productId);
        if (cancelled) return;
        const next = Object.fromEntries(statuses.map((s) => [s.id, s]));
        const finished = initialSources.some((s) => isBusy(s.status) && next[s.id] && !isBusy(next[s.id].status));
        setLive({ base: initialSources, byId: next });
        if (finished) router.refresh();
      } catch {
        // transient; try again next tick
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [anyBusy, initialSources, productId, router]);

  const indexedCount = sources.filter((s) => s.status === "indexed" && s.enabled).length;
  const failedCount = sources.filter((s) => s.status === "error").length;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Pending suggestions</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} awaiting review
          </p>
        </div>
        <SuggestionList suggestions={suggestions} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Sources</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              {indexedCount} of {sources.length} source{sources.length !== 1 ? "s" : ""} live
              {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              {anyBusy ? " · indexing…" : ""}
            </p>
          </div>
          <AddSourceDialog productId={productId} />
        </div>
        <SourceList sources={sources} />
      </div>

      <TestQueryPanel productId={productId} />
    </div>
  );
}
