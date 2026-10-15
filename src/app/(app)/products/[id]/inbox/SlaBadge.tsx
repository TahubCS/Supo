"use client";

import { formatDistanceStrict } from "date-fns";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { firstResponseState, resolutionState, type SlaState } from "@/lib/sla/state";

import type { ConversationWithDetails } from "./types";

/** Current time, refreshed every 30 seconds so SLA countdowns stay live. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const TONE: Record<Exclude<SlaState, "none">, string> = {
  breached: "border-red-500/40 bg-red-500/10 text-red-500",
  due_soon: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  ok: "border-border text-[color:var(--text-secondary)]",
  met: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
};

type SlaConversation = Pick<
  ConversationWithDetails,
  "firstResponseDueAt" | "firstResponseAt" | "resolutionDueAt" | "resolvedAt" | "status"
>;

/** The most urgent SLA signal for a conversation, or null when there is nothing to show. */
export function slaSummary(conv: SlaConversation, now: Date): { state: SlaState; label: string } | null {
  const first = firstResponseState(conv, now);
  if (first === "breached" && !conv.firstResponseAt) return { state: first, label: "Reply overdue" };
  if (first === "due_soon" || first === "ok") {
    return { state: first, label: `Reply in ${formatDistanceStrict(conv.firstResponseDueAt!, now)}` };
  }
  const resolution = resolutionState(conv, now);
  if (resolution === "breached" && conv.status !== "resolved") return { state: resolution, label: "Resolution overdue" };
  if (resolution === "due_soon") {
    return { state: resolution, label: `Resolve in ${formatDistanceStrict(conv.resolutionDueAt!, now)}` };
  }
  return null;
}

export function SlaBadge({ conv, now }: { conv: SlaConversation; now: Date }) {
  const summary = slaSummary(conv, now);
  if (!summary || summary.state === "none") return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] ${TONE[summary.state]}`}
      title={
        conv.firstResponseDueAt
          ? `First response due ${conv.firstResponseDueAt.toLocaleString()}${
              conv.resolutionDueAt ? ` · resolution due ${conv.resolutionDueAt.toLocaleString()}` : ""
            }`
          : undefined
      }
    >
      {summary.label}
    </span>
  );
}

/** Detailed SLA rows for the conversation header. */
export function SlaDetails({ conv, now }: { conv: SlaConversation; now: Date }) {
  const first = firstResponseState(conv, now);
  const resolution = resolutionState(conv, now);
  if (first === "none" && resolution === "none") return null;
  const describe = (state: SlaState, due: Date | null, doneAt: Date | null, noun: string) => {
    if (state === "none" || !due) return null;
    if (state === "met") return `${noun} met`;
    if (state === "breached") {
      return doneAt
        ? `${noun} missed by ${formatDistanceStrict(doneAt, due)}`
        : `${noun} overdue by ${formatDistanceStrict(now, due)}`;
    }
    return `${noun} due in ${formatDistanceStrict(due, now)}`;
  };
  const rows = [
    { state: first, text: describe(first, conv.firstResponseDueAt, conv.firstResponseAt, "First response") },
    {
      state: resolution,
      text: describe(resolution, conv.resolutionDueAt, conv.status === "resolved" ? conv.resolvedAt : null, "Resolution"),
    },
  ].filter((row): row is { state: Exclude<SlaState, "none">; text: string } => row.state !== "none" && Boolean(row.text));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rows.map((row) => (
        <span key={row.text} className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE[row.state]}`}>
          {row.text}
        </span>
      ))}
    </div>
  );
}

export function RatingBadge({ rating }: { rating: { score: number; comment: string | null } | null }) {
  if (!rating) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-secondary)]"
      title={rating.comment ? `“${rating.comment}”` : `Rated ${rating.score} out of 5`}
    >
      <Star className={`size-2.5 ${rating.score >= 4 ? "fill-amber-400 text-amber-400" : rating.score <= 2 ? "fill-red-400 text-red-400" : "fill-current"}`} />
      {rating.score}
    </span>
  );
}
