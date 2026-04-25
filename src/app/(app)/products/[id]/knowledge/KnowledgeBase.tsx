"use client";

import { AddSourceDialog } from "./AddSourceDialog";
import { SuggestionList, type Suggestion } from "./SuggestionList";
import { SourceList } from "./SourceList";
import { TestQueryPanel } from "./TestQueryPanel";

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

export function KnowledgeBase({
  productId,
  sources,
  suggestions,
}: {
  productId: string;
  sources: Source[];
  suggestions: Suggestion[];
}) {
  return (
    <div className="space-y-8">
      {/* Suggestions section */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Pending suggestions</p>
          <p className="text-xs text-[color:var(--text-secondary)]">
            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} awaiting review
          </p>
        </div>
        <SuggestionList suggestions={suggestions} />
      </div>

      {/* Sources section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Sources</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              {sources.length} source{sources.length !== 1 ? "s" : ""} indexed
            </p>
          </div>
          <AddSourceDialog productId={productId} />
        </div>
        <SourceList sources={sources} />
      </div>

      {/* Test Q&A */}
      <TestQueryPanel productId={productId} />
    </div>
  );
}
