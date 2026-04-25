"use client";

import { formatDistanceToNow } from "date-fns";
import { Check, FileQuestion, MessageSquare, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { approveSuggestion, rejectSuggestion } from "./actions";

export type Suggestion = {
  id: string;
  productId: string;
  sourceConversationId: string | null;
  approvedSourceId: string | null;
  status: string;
  confidence: number;
  question: string;
  answer: string;
  content: string;
  reason: string | null;
  reviewNote: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sourceConversation: {
    id: string;
    subject: string | null;
    status: string;
    lastMessageAt: Date;
    customer: { id: string; name: string; email: string } | null;
  } | null;
};

function ConfidenceBadge({ value }: { value: number }) {
  const tone =
    value >= 80
      ? "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)]"
      : value >= 50
        ? "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)]"
        : "border border-border text-[color:var(--text-secondary)]";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {value}% confidence
    </span>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const customer = suggestion.sourceConversation?.customer;

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveSuggestion(suggestion.id);
        setOpen(false);
        toast.success("Suggestion approved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to approve suggestion");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectSuggestion(suggestion.id);
        setOpen(false);
        toast.success("Suggestion rejected");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reject suggestion");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 transition-colors duration-200 hover:bg-[color:var(--card-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <FileQuestion className="size-4 shrink-0 text-[color:var(--text-secondary)]" />
            <p className="line-clamp-2 text-sm font-medium text-foreground">
              {suggestion.question}
            </p>
          </div>
          {suggestion.reason ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-[color:var(--text-secondary)]">
              {suggestion.reason}
            </p>
          ) : null}
        </div>
        <ConfidenceBadge value={suggestion.confidence} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-tertiary)]">
        {customer ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            {customer.name}
          </span>
        ) : null}
        <span>{formatDistanceToNow(suggestion.createdAt, { addSuffix: true })}</span>
        <Badge
          variant="outline"
          className="h-5 rounded-full px-2 text-[10px] font-normal capitalize text-[color:var(--text-secondary)]"
        >
          {suggestion.status}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-border text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:text-foreground"
            >
              Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Knowledge suggestion</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge value={suggestion.confidence} />
                {customer ? (
                  <span className="text-xs text-[color:var(--text-secondary)]">
                    From {customer.name} ({customer.email})
                  </span>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[color:var(--text-secondary)]">Question</p>
                <p className="text-sm leading-relaxed text-foreground">{suggestion.question}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[color:var(--text-secondary)]">Answer</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {suggestion.answer}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[color:var(--text-secondary)]">Content</p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-[color:var(--card-elevated)] p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {suggestion.content}
                  </p>
                </div>
              </div>

              {suggestion.reason ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[color:var(--text-secondary)]">Reason</p>
                  <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                    {suggestion.reason}
                  </p>
                </div>
              ) : null}

              {suggestion.sourceConversation ? (
                <div className="rounded-lg border border-border bg-card p-3 text-xs text-[color:var(--text-secondary)]">
                  <p className="font-medium text-foreground">
                    {suggestion.sourceConversation.subject ?? "Source conversation"}
                  </p>
                  <p className="mt-1">
                    {suggestion.sourceConversation.status} - last message{" "}
                    {formatDistanceToNow(suggestion.sourceConversation.lastMessageAt, {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleReject}
                  className="gap-1.5 rounded-lg border-border text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--status-error)] hover:text-[color:var(--status-error)]"
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={handleApprove}
                  className="gap-1.5 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={handleReject}
            title="Reject"
            className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--status-error)]"
          >
            <X className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={handleApprove}
            title="Approve"
            className="size-7 rounded-md text-[color:var(--text-tertiary)] hover:text-foreground"
          >
            <Check className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
        <FileQuestion className="mb-3 size-6 text-[color:var(--text-tertiary)]" />
        <p className="text-sm font-medium text-foreground">No pending suggestions</p>
        <p className="mt-1 max-w-sm text-xs text-[color:var(--text-secondary)]">
          Resolved conversations will appear here when Supo finds useful knowledge to review.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {suggestions.map((suggestion) => (
        <SuggestionCard key={suggestion.id} suggestion={suggestion} />
      ))}
    </div>
  );
}
