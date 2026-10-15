"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { testQuery, type QueryResult } from "./actions";

function formatScore(similarity: number | null) {
  return similarity === null ? "keyword" : `${Math.round(similarity * 100)}%`;
}

export function TestQueryPanel({ productId }: { productId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showMatches, setShowMatches] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAsk() {
    if (!question.trim()) return;
    startTransition(async () => {
      try {
        setResult(await testQuery(productId, question.trim()));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Test failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm font-medium text-foreground">Test your knowledge base</p>
      <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
        Ask a question your customers might ask. This uses the same retrieval and prompt as the live widget.
      </p>

      <div className="mt-4 flex gap-2">
        <Input
          placeholder="e.g. How do I reset my password?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
          className="flex-1 text-sm"
        />
        <Button
          onClick={handleAsk}
          disabled={isPending || !question.trim()}
          className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
        >
          Ask
        </Button>
      </div>

      {isPending && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}

      {!isPending && result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{result.answer}</p>
          </div>

          {result.sources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[color:var(--text-tertiary)]">Sources:</span>
              {result.sources.map((s) => (
                <a
                  key={s.url ?? s.title}
                  href={s.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded border border-border bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs text-[color:var(--text-secondary)] hover:text-foreground"
                >
                  {s.title}
                  {s.url && <ExternalLink className="size-3" />}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[color:var(--text-tertiary)]">
              No knowledge matched — customers asking this get a &quot;don&apos;t know&quot; answer. Add a source or answer the gap above.
            </p>
          )}

          {result.matches.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowMatches((v) => !v)}
                className="text-xs text-[color:var(--text-secondary)] underline-offset-2 hover:underline"
              >
                {showMatches ? "Hide" : "Show"} retrieved passages ({result.matches.length})
              </button>
              {showMatches && (
                <ul className="mt-2 space-y-2">
                  {result.matches.map((m, i) => (
                    <li key={i} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">{m.title}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                            m.relevant
                              ? "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)]"
                              : "bg-[color:var(--card-elevated)] text-[color:var(--text-tertiary)]"
                          }`}
                        >
                          {formatScore(m.similarity)} · {m.relevant ? "used" : "below threshold"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs text-[color:var(--text-secondary)]">{m.preview}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
