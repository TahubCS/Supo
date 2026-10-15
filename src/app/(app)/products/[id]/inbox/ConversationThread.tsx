"use client";

import type * as Ably from "ably";
import { format, formatDistanceToNow, isSameDay } from "date-fns";
import {
  ArrowRightLeft,
  BookOpen,
  Bot,
  ChevronDown,
  Clock,
  ExternalLink,
  Lock,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { HANDOFF_REASON_LABELS } from "@/lib/handoff/policy";
import type { ProductRole } from "@/lib/product-access";
import { conversationChannelName, inboxChannelName } from "@/lib/realtime-channels";

import { ignoreExpectedAblyTeardown } from "./ably-client";
import {
  addInternalNote,
  applyMacro,
  assignConversation,
  claimConversation,
  draftReply,
  getMessages,
  handBackToAI,
  learnFromConversation,
  reopenConversation,
  resolveConversation,
  sendMessage,
  sendTypingIndicator,
  snoozeConversation,
  refreshSummary,
  takeOverConversation,
  type MacroSummary,
  type Teammate,
} from "./actions";
import { CustomerSidebar, PriorityBadge } from "./CustomerSidebar";
import type { ConversationWithDetails, InboxMessage } from "./types";

const MAX_REPLY_LENGTH = 5000;
const TYPING_THROTTLE_MS = 2500;
const FALLBACK_POLL_MS = 5000;

const SNOOZE_OPTIONS = [
  { id: "1h", label: "1 hour" },
  { id: "4h", label: "4 hours" },
  { id: "1d", label: "Tomorrow" },
  { id: "1w", label: "Next week" },
];

type ConversationPatch = Partial<
  Pick<ConversationWithDetails, "status" | "escalationStatus" | "assigneeId" | "aiHandled" | "priority" | "tags">
>;

function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] text-[color:var(--text-tertiary)]">{format(date, "MMMM d, yyyy")}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageBubble({ msg }: { msg: InboxMessage }) {
  if (msg.senderType === "note") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] space-y-1">
          <div className="whitespace-pre-wrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            {msg.body}
          </div>
          <p className="flex items-center justify-end gap-1 text-right text-[10px] text-amber-600 dark:text-amber-400">
            <Lock className="size-2.5" /> Internal note · {msg.senderName ?? "Teammate"} · {format(msg.createdAt, "h:mm a")}
          </p>
        </div>
      </div>
    );
  }

  if (msg.senderType === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[80%] rounded-full border border-border px-3 py-1 text-center text-[11px] text-[color:var(--text-secondary)]">
          {msg.body}
        </p>
      </div>
    );
  }

  if (msg.senderType === "agent") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] space-y-1">
          <div className="whitespace-pre-wrap rounded-lg bg-foreground px-3 py-2 text-sm text-background">{msg.body}</div>
          <p className="text-right text-[10px] text-[color:var(--text-tertiary)]">
            {msg.senderName ?? "Agent"} · {format(msg.createdAt, "h:mm a")}
          </p>
        </div>
      </div>
    );
  }

  const isAI = msg.senderType === "ai";
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] space-y-1">
        {isAI && (
          <p className="flex items-center gap-1 text-[10px] font-medium text-[color:var(--text-tertiary)]">
            <Bot className="size-3" /> AI assistant
          </p>
        )}
        <div
          className={`whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm ${
            isAI ? "bg-[color:var(--card-elevated)]" : "bg-card"
          } text-foreground`}
        >
          {msg.body}
        </div>
        {isAI && msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.sources.map((source) =>
              source.url ? (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-[color:var(--text-secondary)] hover:text-foreground"
                >
                  {source.title}
                  <ExternalLink className="size-2.5" />
                </a>
              ) : (
                <span
                  key={source.title}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                >
                  {source.title}
                </span>
              ),
            )}
          </div>
        )}
        <p className="text-[10px] text-[color:var(--text-tertiary)]">{format(msg.createdAt, "h:mm a")}</p>
      </div>
    </div>
  );
}

function HandoffPanel({
  conversation,
  onRefresh,
}: {
  conversation: ConversationWithDetails;
  onRefresh: () => void;
}) {
  if (!conversation.escalationStatus && !conversation.aiSummary) return null;
  const reason = conversation.handoffReason ? HANDOFF_REASON_LABELS[conversation.handoffReason] : null;
  return (
    <div className="mx-5 mt-4 rounded-lg border border-border bg-[color:var(--card-elevated)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-secondary)]">
        <Sparkles className="size-3.5" />
        <span className="font-medium text-foreground">Handoff</span>
        {reason && <span>· {reason}</span>}
        {conversation.escalatedAt && (
          <span>· {formatDistanceToNow(conversation.escalatedAt, { addSuffix: true })}</span>
        )}
        {conversation.followUpEmail && <span>· follow up at {conversation.followUpEmail}</span>}
        <button
          type="button"
          onClick={onRefresh}
          title="Regenerate summary"
          aria-label="Regenerate summary"
          className="ml-auto text-[color:var(--text-tertiary)] hover:text-foreground"
        >
          <RefreshCw className="size-3" />
        </button>
      </div>
      {conversation.aiSummary ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{conversation.aiSummary}</p>
      ) : conversation.escalationStatus ? (
        <p className="mt-2 text-xs text-[color:var(--text-tertiary)]">Generating summary…</p>
      ) : null}
    </div>
  );
}

export function ConversationThread({
  conversation,
  productId,
  orgId,
  currentUserId,
  productRole,
  teammates,
  macros,
  ablyClient,
  onConversationChange,
  onSelectConversation,
}: {
  conversation: ConversationWithDetails | null;
  productId: string;
  orgId: string;
  currentUserId: string;
  productRole: ProductRole;
  teammates: Teammate[];
  macros: MacroSummary[];
  ablyClient: Ably.Realtime | null;
  onConversationChange: (patch: ConversationPatch) => void;
  onSelectConversation: (id: string) => void;
}) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply");
  const [resolveAfterSend, setResolveAfterSend] = useState(false);
  const [macroIndex, setMacroIndex] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(Boolean(conversation));
  const [replyBody, setReplyBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTypingSentAt = useRef(0);
  const conversationId = conversation?.id ?? null;

  const isManager = productRole !== "agent";
  const isMine = conversation?.assigneeId === currentUserId;
  const canViewThread = Boolean(conversation) && (isManager || isMine);

  // Initial load (the component is keyed by conversation id).
  useEffect(() => {
    if (!conversationId || !canViewThread) return;
    let cancelled = false;
    getMessages(conversationId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load messages"))
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewThread, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Live messages: Ably when configured, polling otherwise.
  useEffect(() => {
    if (!conversationId || !canViewThread) return;

    if (!ablyClient) {
      const timer = setInterval(() => {
        getMessages(conversationId).then(setMessages).catch(() => {});
      }, FALLBACK_POLL_MS);
      return () => clearInterval(timer);
    }

    const ch = ablyClient.channels.get(conversationChannelName(orgId, productId, conversationId));
    function onMessage(msg: Ably.Message) {
      const d = msg.data as {
        id: string;
        body: string;
        senderType: string;
        senderName?: string;
        sources?: InboxMessage["sources"];
        createdAt: string;
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === d.id)) return prev;
        return [
          ...prev,
          {
            id: d.id,
            conversationId: conversationId!,
            body: d.body,
            senderType: d.senderType,
            senderId: null,
            senderName: d.senderName ?? null,
            sources: d.sources ?? null,
            createdAt: new Date(d.createdAt),
          },
        ];
      });
    }
    // Internal notes travel on the agents-only inbox channel, never the customer's.
    const inboxCh = ablyClient.channels.get(inboxChannelName(orgId, productId));
    function onNote(msg: Ably.Message) {
      const d = msg.data as { conversationId: string; message: Omit<InboxMessage, "createdAt"> & { createdAt: string } };
      if (d.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === d.message.id) ? prev : [...prev, { ...d.message, createdAt: new Date(d.message.createdAt) }],
      );
    }
    void Promise.resolve(ch.subscribe("message", onMessage)).catch(ignoreExpectedAblyTeardown);
    void Promise.resolve(inboxCh.subscribe("note_added", onNote)).catch(ignoreExpectedAblyTeardown);
    return () => {
      try {
        ch.unsubscribe("message", onMessage);
        inboxCh.unsubscribe("note_added", onNote);
      } catch {
        // Channel may already be detached during Fast Refresh.
      }
    };
  }, [ablyClient, canViewThread, conversationId, orgId, productId]);

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <MessageSquare className="size-8 text-[color:var(--text-tertiary)]" />
        <p className="text-sm text-[color:var(--text-secondary)]">Select a conversation</p>
      </div>
    );
  }

  const conv = conversation;

  function run(action: () => Promise<void>, patch?: ConversationPatch, success?: string) {
    startTransition(async () => {
      try {
        await action();
        if (patch) onConversationChange(patch);
        if (success) toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  const macroQuery = composerMode === "reply" && /^\/[^\s]*$/.test(replyBody) ? replyBody.slice(1).toLowerCase() : null;
  const macroMatches =
    macroQuery === null
      ? []
      : macros
          .filter((m) => (m.shortcut ?? "").startsWith(macroQuery) || m.title.toLowerCase().includes(macroQuery))
          .slice(0, 6);

  function insertMacro(macroId: string) {
    startTransition(async () => {
      try {
        const result = await applyMacro(conv.id, macroId);
        setReplyBody(result.body);
        setResolveAfterSend(result.resolveAfterSend);
        onConversationChange({ tags: result.tags, priority: result.priority });
        setMacroIndex(0);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not apply macro");
      }
    });
  }

  function handleDraft() {
    startTransition(async () => {
      try {
        const { draft } = await draftReply(conv.id);
        setComposerMode("reply");
        setReplyBody(draft);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not draft a reply");
      }
    });
  }

  function handleSend() {
    const body = replyBody.trim();
    if (!body) return;
    setReplyBody("");
    const mode = composerMode;
    const shouldResolve = resolveAfterSend && mode === "reply";
    setResolveAfterSend(false);
    startTransition(async () => {
      try {
        const saved = mode === "note" ? await addInternalNote(conv.id, body) : await sendMessage(conv.id, body);
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        if (mode === "reply" && !conv.assigneeId) {
          onConversationChange({ assigneeId: currentUserId, escalationStatus: "active", aiHandled: false });
        }
        if (shouldResolve) {
          await resolveConversation(conv.id);
          onConversationChange({ status: "resolved", escalationStatus: null, assigneeId: null, aiHandled: true });
          toast.success("Sent and resolved");
        }
      } catch (error) {
        setReplyBody(body);
        toast.error(error instanceof Error ? error.message : "Message not sent");
      }
    });
  }

  function handleTyping(value: string) {
    setReplyBody(value);
    if (!value.trim()) setResolveAfterSend(false);
    const now = Date.now();
    if (composerMode === "reply" && value.trim() && now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      void sendTypingIndicator(conv.id).catch(() => {});
    }
  }

  function handleLearn() {
    startTransition(async () => {
      try {
        const result = await learnFromConversation(conv.id);
        toast.success(result === "existing" ? "Knowledge suggestion already exists" : "Knowledge suggestion created");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create knowledge suggestion");
      }
    });
  }

  const isResolved = conv.status === "resolved";
  const isUnassigned = !conv.assigneeId;
  const canClaim = isUnassigned && (conv.escalationStatus === "pending" || isManager);
  const canTakeOver = isManager && !isUnassigned && !isMine;
  const canManage = isManager || isMine;
  const assigneeName = teammates.find((t) => t.id === conv.assigneeId)?.name;
  const transferTargets = teammates.filter((t) => t.id !== conv.assigneeId);

  const grouped: Array<{ separator: Date } | { msg: InboxMessage }> = [];
  let lastDate: Date | null = null;
  for (const msg of messages) {
    if (!lastDate || !isSameDay(lastDate, msg.createdAt)) {
      grouped.push({ separator: msg.createdAt });
      lastDate = msg.createdAt;
    }
    grouped.push({ msg });
  }

  return (
    <div className="flex flex-1 overflow-hidden">
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{conv.customer.name}</span>
            {conv.identityVerified && (
              <span title="Identity verified" className="text-emerald-500">
                <ShieldCheck className="size-3.5" />
              </span>
            )}
            {conv.status === "resolved" ? (
              <Badge className="h-4 shrink-0 rounded-full bg-foreground px-1.5 text-[10px] font-normal text-background hover:bg-foreground">
                Resolved
              </Badge>
            ) : conv.status === "snoozed" ? (
              <Badge variant="outline" className="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal text-[color:var(--text-secondary)]">
                Snoozed{conv.snoozedUntil ? ` until ${format(conv.snoozedUntil, "MMM d, h:mm a")}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal">
                Open
              </Badge>
            )}
            {conv.escalationStatus === "pending" && (
              <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-500">
                Waiting for agent
              </span>
            )}
            {conv.escalationStatus === "active" && (
              <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-500">
                {isMine ? "Assigned to you" : `Assigned to ${assigneeName ?? "a teammate"}`}
              </span>
            )}
            {!conv.escalationStatus && conv.aiHandled && (
              <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-tertiary)]">
                AI
              </span>
            )}
            <PriorityBadge priority={conv.priority} />
          </div>
          <p className="truncate text-xs text-[color:var(--text-secondary)]">
            {conv.customer.email ?? conv.followUpEmail ?? "No email provided"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {canClaim && (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(() => claimConversation(conv.id), {
                  assigneeId: currentUserId,
                  escalationStatus: "active",
                  aiHandled: false,
                  status: "open",
                })
              }
              className="gap-1.5 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
            >
              <UserCheck className="size-3.5" />
              {conv.escalationStatus === "pending" ? "Claim" : "Join"}
            </Button>
          )}
          {canTakeOver && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                run(() => takeOverConversation(conv.id), { assigneeId: currentUserId, escalationStatus: "active" })
              }
              className="rounded-lg text-xs"
            >
              Take over
            </Button>
          )}

          {canManage && !isUnassigned && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={isPending} className="gap-1 rounded-lg text-xs">
                  <ArrowRightLeft className="size-3.5" />
                  Transfer
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Assign to</DropdownMenuLabel>
                {transferTargets.map((teammate) => (
                  <DropdownMenuItem
                    key={teammate.id}
                    onClick={() =>
                      run(
                        () => assignConversation(conv.id, teammate.id),
                        { assigneeId: teammate.id, escalationStatus: "active" },
                        `Transferred to ${teammate.name}`,
                      )
                    }
                    className="text-xs"
                  >
                    {teammate.name}
                    <span className="ml-auto text-[10px] capitalize text-[color:var(--text-tertiary)]">{teammate.role}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    run(
                      () => assignConversation(conv.id, null),
                      { assigneeId: null, escalationStatus: "pending" },
                      "Returned to the queue",
                    )
                  }
                  className="text-xs"
                >
                  Return to queue
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    run(
                      () => handBackToAI(conv.id),
                      { assigneeId: null, escalationStatus: null, aiHandled: true },
                      "The AI assistant is answering again",
                    )
                  }
                  className="text-xs"
                >
                  <Bot className="mr-1 size-3.5" />
                  Hand back to AI
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canManage && isResolved && (
            <>
              {isManager && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={handleLearn}
                  title="Create knowledge suggestion"
                  className="gap-1.5 rounded-lg text-xs text-[color:var(--text-secondary)] hover:text-foreground"
                >
                  <BookOpen className="size-3.5" />
                  Learn
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => reopenConversation(conv.id), { status: "open" })}
                className="rounded-lg text-xs"
              >
                Reopen
              </Button>
            </>
          )}

          {canManage && !isResolved && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={isPending} className="gap-1 rounded-lg text-xs">
                    <Clock className="size-3.5" />
                    Snooze
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SNOOZE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() =>
                        run(() => snoozeConversation(conv.id, option.id), { status: "snoozed" }, `Snoozed for ${option.label.toLowerCase()}`)
                      }
                      className="text-xs"
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => resolveConversation(conv.id),
                    { status: "resolved", escalationStatus: null, assigneeId: null, aiHandled: true },
                    "Conversation resolved",
                  )
                }
                className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
              >
                Resolve
              </Button>
            </>
          )}
        </div>
      </div>

      {canViewThread && (
        <HandoffPanel
          conversation={conv}
          onRefresh={() => run(() => refreshSummary(conv.id), undefined, "Regenerating summary…")}
        />
      )}

      <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4">
        {!canViewThread ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm space-y-3 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-card">
                <UserCheck className="size-5 text-[color:var(--text-secondary)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Claim to handle this conversation</p>
                <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                  {conv.handoffReason ? `${HANDOFF_REASON_LABELS[conv.handoffReason] ?? "Needs help"}. ` : ""}
                  The full thread unlocks after you claim it, so the queue stays private between agents.
                </p>
              </div>
            </div>
          </div>
        ) : loadingMessages ? (
          <div className="space-y-4">
            {[false, true, false, true].map((right, i) => (
              <div key={i} className={`flex ${right ? "justify-end" : "justify-start"}`}>
                <Skeleton className="h-12 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[color:var(--text-tertiary)]">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((item, i) =>
              "separator" in item ? (
                <DateSeparator key={`sep-${i}`} date={item.separator} />
              ) : (
                <MessageBubble key={item.msg.id} msg={item.msg} />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {canViewThread && (
        <div
          className={`border-t px-4 py-3 ${
            composerMode === "note" ? "border-amber-500/40 bg-amber-500/5" : "border-border"
          }`}
        >
          <div className="mb-2 flex items-center gap-1">
            {(["reply", "note"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setComposerMode(mode)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  composerMode === mode
                    ? "bg-[color:var(--card-elevated)] font-medium text-foreground"
                    : "text-[color:var(--text-secondary)] hover:text-foreground"
                }`}
              >
                {mode === "reply" ? "Reply" : "Internal note"}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleDraft}
              className="ml-auto h-7 gap-1 text-xs text-[color:var(--text-secondary)]"
              title="Draft a reply from the knowledge base"
            >
              <Wand2 className="size-3.5" /> Draft with AI
            </Button>
          </div>
          {composerMode === "reply" && !isMine && !isUnassigned && (
            <p className="mb-2 text-[11px] text-[color:var(--text-tertiary)]">
              {assigneeName ?? "A teammate"} is handling this conversation. Your reply will be sent without reassigning it.
            </p>
          )}
          {composerMode === "reply" && isUnassigned && !isResolved && (
            <p className="mb-2 text-[11px] text-[color:var(--text-tertiary)]">
              Replying assigns this conversation to you and pauses the AI assistant.
            </p>
          )}
          {composerMode === "note" && (
            <p className="mb-2 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <Lock className="size-3" /> Only your team can see internal notes.
            </p>
          )}
          <div className="relative">
            {macroMatches.length > 0 && (
              <ul className="absolute bottom-full left-0 z-10 mb-1 w-full max-w-md overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {macroMatches.map((m, index) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMacro(m.id);
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                        index === macroIndex ? "bg-[color:var(--card-elevated)]" : ""
                      }`}
                    >
                      <Zap className="mt-0.5 size-3 shrink-0 text-[color:var(--text-tertiary)]" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">
                          {m.title}
                          {m.shortcut && <span className="ml-1 font-mono text-[color:var(--text-tertiary)]">/{m.shortcut}</span>}
                        </span>
                        <span className="block truncate text-[11px] text-[color:var(--text-secondary)]">{m.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              placeholder={
                composerMode === "note"
                  ? "Write a note for your team…"
                  : macros.length > 0
                    ? "Reply…  Type / for macros, ⌘/Ctrl + Enter to send"
                    : "Reply…  (⌘/Ctrl + Enter to send)"
              }
              value={replyBody}
              onChange={(e) => {
                handleTyping(e.target.value);
                setMacroIndex(0);
              }}
              rows={3}
              maxLength={MAX_REPLY_LENGTH}
              disabled={isPending}
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if (macroMatches.length > 0) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMacroIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + macroMatches.length) % macroMatches.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMacro(macroMatches[Math.min(macroIndex, macroMatches.length - 1)].id);
                    return;
                  }
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[color:var(--text-tertiary)]">
              {replyBody.length}/{MAX_REPLY_LENGTH}
              {resolveAfterSend && composerMode === "reply" ? " · will resolve after sending" : ""}
            </span>
            <Button
              size="sm"
              disabled={isPending || !replyBody.trim()}
              onClick={handleSend}
              className={`rounded-lg text-xs ${
                composerMode === "note"
                  ? "bg-amber-500 text-white hover:bg-amber-500/90"
                  : "bg-foreground text-background hover:bg-foreground/90"
              }`}
            >
              {composerMode === "note" ? "Add note" : resolveAfterSend ? "Send & resolve" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
    <CustomerSidebar
      conversation={conv}
      canEdit={canViewThread}
      onSelectConversation={onSelectConversation}
      onChange={(patch) => onConversationChange(patch)}
    />
    </div>
  );
}
