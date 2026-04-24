"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { testQuery, type QueryResult } from "./actions";

export function TestQueryPanel({ productId }: { productId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAsk() {
    if (!question.trim()) return;
    startTransition(async () => {
      const r = await testQuery(productId, question.trim());
      setResult(r);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm font-medium text-foreground">Test your knowledge base</p>
      <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
        Ask a question your customers might ask and see exactly what the AI would answer.
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
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {result.answer}
            </p>
          </div>

          {result.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[color:var(--text-tertiary)]">Sources:</span>
              {result.sources.map((s) => (
                <span
                  key={s.name}
                  className="rounded border border-border bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs text-[color:var(--text-secondary)]"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
