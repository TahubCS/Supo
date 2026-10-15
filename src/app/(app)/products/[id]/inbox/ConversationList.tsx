"use client";

import { format, formatDistanceToNow, isToday } from "date-fns";
import { CheckSquare, Mail, MessageSquare, Search, Square } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { bulkResolve, searchConversations } from "./actions";
import { nextSlaDeadline } from "@/lib/sla/state";

import { PriorityBadge } from "./CustomerSidebar";
import { RatingBadge, SlaBadge, useNow } from "./SlaBadge";
import type { ConversationWithDetails } from "./types";

type FilterTab = "waiting" | "mine" | "open" | "resolved" | "all";
type SortOrder = "recent" | "due";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "mine", label: "Mine" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

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
  checked,
  selectionMode,
  now,
  onClick,
  onToggleCheck,
}: {
  conv: ConversationWithDetails;
  now: Date;
  selected: boolean;
  checked: boolean;
  selectionMode: boolean;
  onClick: () => void;
  onToggleCheck: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`w-full cursor-pointer px-4 py-3 text-left transition-colors duration-150 hover:bg-[color:var(--card-elevated)] ${
        selected ? "bg-[color:var(--card-elevated)]" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={checked ? "Deselect conversation" : "Select conversation"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck();
          }}
          className={`group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--avatar-surface)] text-xs font-semibold text-foreground`}
        >
          <span className={selectionMode || checked ? "hidden" : "group-hover:hidden"}>{initials(conv.customer.name)}</span>
          <span className={selectionMode || checked ? "" : "hidden group-hover:inline"}>
            {checked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
          </span>
        </button>

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

          <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
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
                Waiting{conv.escalatedAt ? ` ${formatDistanceToNow(conv.escalatedAt)}` : ""}
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
            {conv.channel === "email" && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-secondary)]">
                <Mail className="size-2.5" /> Email
              </span>
            )}
            <SlaBadge conv={conv} now={now} />
            <PriorityBadge priority={conv.priority} />
            <RatingBadge rating={conv.rating} />
            {conv.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="truncate rounded-full bg-[color:var(--card-elevated)] px-1.5 py-px text-[10px] text-[color:var(--text-secondary)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
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
  currentUserId,
  productId,
  onLoadConversation,
  onResolved,
}: {
  conversations: ConversationWithDetails[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
  productId: string;
  onLoadConversation: (id: string) => void;
  onResolved: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [serverMatches, setServerMatches] = useState<{ query: string; ids: Set<string> }>({ query: "", ids: new Set() });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const now = useNow();

  // Full-text search over message bodies runs on the server (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      searchConversations(productId, q)
        .then((ids) => {
          setServerMatches({ query: q, ids: new Set(ids) });
          ids.slice(0, 25).forEach(onLoadConversation);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [onLoadConversation, productId, query]);
  const [tab, setTab] = useState<FilterTab>(() =>
    conversations.some((c) => c.escalationStatus === "pending" && !c.assigneeId) ? "waiting" : "open",
  );

  const needsAgentCount = useMemo(
    () => conversations.filter((c) => c.escalationStatus === "pending").length,
    [conversations],
  );

  const filtered = useMemo(() => {
    let list = conversations;
    if (tab === "waiting") list = list.filter((c) => c.escalationStatus === "pending" && !c.assigneeId && c.status !== "resolved");
    else if (tab === "mine") list = list.filter((c) => c.assigneeId === currentUserId && c.status !== "resolved");
    else if (tab !== "all") list = list.filter((c) => c.status === tab);
    if (query.trim()) {
      const q = query.toLowerCase();
      const serverIds = serverMatches.query === query.trim() ? serverMatches.ids : null;
      list = list.filter(
        (c) =>
          serverIds?.has(c.id) ||
          c.customer.name.toLowerCase().includes(q) ||
          (c.customer.email ?? "").toLowerCase().includes(q) ||
          c.tags.some((tag) => tag.includes(q)) ||
          c.latestMessage?.body.toLowerCase().includes(q),
      );
    }
    if (sortOrder === "due") {
      // Earliest SLA deadline first; conversations without one keep recency order.
      list = [...list].sort((a, b) => {
        const diff = nextSlaDeadline(a) - nextSlaDeadline(b);
        return Number.isNaN(diff) || diff === 0 ? b.lastMessageAt.getTime() - a.lastMessageAt.getTime() : diff;
      });
    }
    return list;
  }, [conversations, tab, query, currentUserId, serverMatches, sortOrder]);

  // Keyboard navigation: j / k move through the list.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (filtered.length === 0) return;
      const index = filtered.findIndex((c) => c.id === selectedId);
      const next = e.key === "j" ? Math.min(filtered.length - 1, index + 1) : Math.max(0, index - 1);
      onSelect(filtered[index === -1 ? 0 : next].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, onSelect, selectedId]);

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkResolve() {
    const ids = [...checked];
    startTransition(async () => {
      const result = await bulkResolve(ids);
      if (result.failed > 0) toast.error(`${result.failed} conversation(s) could not be resolved`);
      if (result.resolvedIds.length > 0) toast.success(`Resolved ${result.resolvedIds.length} conversation(s)`);
      // Only reflect the ones the server actually resolved; keep failures selected.
      onResolved(result.resolvedIds);
      // Drop only what was resolved; keep any selection changes made meanwhile.
      setChecked((current) => new Set([...current].filter((id) => !result.resolvedIds.includes(id))));
    });
  }

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

        {checked.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs">
            <span className="text-[color:var(--text-secondary)]">{checked.size} selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setChecked(new Set())} className="text-[color:var(--text-secondary)] hover:text-foreground">
                Clear
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleBulkResolve}
                className="font-medium text-foreground hover:underline"
              >
                Resolve
              </button>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-2">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
          <Input
            placeholder="Search messages, customers, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
          <select
            aria-label="Sort conversations"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="h-8 shrink-0 rounded-md border border-border bg-transparent px-1.5 text-xs text-[color:var(--text-secondary)]"
          >
            <option value="recent">Recent</option>
            <option value="due">Due soon</option>
          </select>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`${segmentBase} ${tab === t.id ? segmentActive : segmentInactive}`}
            >
              {t.label}
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
                    : tab === "waiting"
                      ? "Nobody is waiting for an agent"
                      : tab === "mine"
                        ? "No conversations assigned to you"
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
                checked={checked.has(conv.id)}
                selectionMode={checked.size > 0}
                now={now}
                onClick={() => onSelect(conv.id)}
                onToggleCheck={() => toggleChecked(conv.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
