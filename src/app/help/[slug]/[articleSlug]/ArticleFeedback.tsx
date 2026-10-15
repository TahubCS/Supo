"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const storageKey = (articleId: string) => `supo-help-feedback:${articleId}`;

function readVote(articleId: string): "yes" | "no" | null {
  try {
    const value = window.localStorage.getItem(storageKey(articleId));
    return value === "yes" || value === "no" ? value : null;
  } catch {
    return null;
  }
}

// localStorage is only read on the client; the server snapshot is "not voted".
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

export function ArticleFeedback({ articleId }: { articleId: string }) {
  const stored = useSyncExternalStore(subscribe, () => readVote(articleId), () => null);
  const [justVoted, setVote] = useState<"yes" | "no" | null>(null);
  const [sending, setSending] = useState(false);
  const vote = justVoted ?? stored;

  async function send(helpful: boolean) {
    setSending(true);
    try {
      const res = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, helpful }),
      });
      if (res.ok || res.status === 429) {
        const next = helpful ? "yes" : "no";
        setVote(next);
        try {
          window.localStorage.setItem(storageKey(articleId), next);
        } catch {
          // Storage may be unavailable (private mode); the vote still counted.
        }
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-6 text-sm">
      {vote ? (
        <p className="text-[color:var(--text-secondary)]">
          {vote === "yes" ? "Thanks! Glad it helped." : "Thanks for letting us know. We'll work on improving this article."}
        </p>
      ) : (
        <>
          <span className="text-[color:var(--text-secondary)]">Was this article helpful?</span>
          <button
            type="button"
            disabled={sending}
            onClick={() => send(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-[color:var(--card-elevated)]"
          >
            <ThumbsUp className="size-4" /> Yes
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => send(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-[color:var(--card-elevated)]"
          >
            <ThumbsDown className="size-4" /> No
          </button>
        </>
      )}
    </div>
  );
}
