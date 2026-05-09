"use client";

import { format, formatDistanceToNow, isToday } from "date-fns";
import { MessageSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { ConversationWithDetails } from "./types";

type FilterTab = "all" | "open" | "resolved";

function relativeTime(d: Date) {
  return isToday(d) ? format(d, "h:mm a") : formatDistanceToNow(d, { addSuffix: true });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationWithDetails;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-[color:var(--card-elevated)] ${
        selected ? "bg-[color:var(--card-elevated)]" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--avatar-surface)] text-xs font-semibold text-foreground">
          {initials(conv.customer.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {conv.customer.name}
            </span>
            <span className="shrink-0 text-xs text-[color:var(--text-tertiary)]">
              {relativeTime(conv.lastMessageAt)}
            </span>
          </div>

          {conv.latestMessage ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
              {conv.latestMessage.body}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[color:var(--text-tertiary)] italic">
              No messages yet
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-1.5">
            {conv.status === "open" ? (
              <Badge
                variant="outline"
                className="h-4 rounded-full px-1.5 text-[10px] font-normal"
              >
                Open
              </Badge>
            ) : conv.status === "resolved" ? (
              <Badge className="h-4 rounded-full bg-foreground px-1.5 text-[10px] font-normal text-background hover:bg-foreground">
                Resolved
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-4 rounded-full px-1.5 text-[10px] font-normal text-[color:var(--text-secondary)]"
              >
                Snoozed
              </Badge>
            )}
            {conv.escalationStatus === "pending" && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-500">
                Needs Agent
              </span>
            )}
            {conv.escalationStatus === "active" && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-500">
                Agent Active
              </span>
            )}
            {!conv.escalationStatus && conv.aiHandled && (
              <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-tertiary)]">
                AI
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

const segmentBase =
  "flex-1 py-1.5 text-xs font-medium transition-colors duration-150";
const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
const segmentInactive = "text-[color:var(--text-secondary)] hover:text-foreground";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationWithDetails[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const needsAgentCount = useMemo(
    () => conversations.filter((c) => c.escalationStatus === "pending").length,
    [conversations],
  );

  const filtered = useMemo(() => {
    let list = conversations;
    if (tab !== "all") list = list.filter((c) => c.status === tab);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.customer.name.toLowerCase().includes(q) ||
          (c.customer.email ?? "").toLowerCase().includes(q) ||
          c.latestMessage?.body.toLowerCase().includes(q),
      );
    }
    return list;
  }, [conversations, tab, query]);

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Inbox</span>
          <div className="flex items-center gap-1.5">
            {needsAgentCount > 0 && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                {needsAgentCount} waiting
              </span>
            )}
            <span className="rounded-full bg-[color:var(--card-elevated)] px-2 py-0.5 text-xs text-[color:var(--text-secondary)]">
              {conversations.length}
            </span>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
          <Input
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["all", "open", "resolved"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`${segmentBase} capitalize ${tab === t ? segmentActive : segmentInactive}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            {query.trim() ? (
              <>
                <Search className="size-5 text-[color:var(--text-tertiary)]" />
                <p className="text-xs text-[color:var(--text-secondary)]">
                  No results for &ldquo;{query}&rdquo;
                </p>
              </>
            ) : (
              <>
                <MessageSquare className="size-5 text-[color:var(--text-tertiary)]" />
                <p className="text-xs text-[color:var(--text-secondary)]">
                  {tab === "all"
                    ? "No conversations yet"
                    : `No ${tab} conversations`}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                selected={conv.id === selectedId}
                onClick={() => onSelect(conv.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
