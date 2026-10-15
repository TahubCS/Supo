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
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserCheck,
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
import { conversationChannelName } from "@/lib/realtime-channels";

import { ignoreExpectedAblyTeardown } from "./ably-client";
import {
  assignConversation,
  claimConversation,
  getMessages,
  handBackToAI,
  learnFromConversation,
  reopenConversation,
  resolveConversation,
  sendMessage,
  sendTypingIndicator,
  snoozeConversation,
  takeOverConversation,
  type Teammate,
} from "./actions";
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

type ConversationPatch = Partial<Pick<ConversationWithDetails, "status" | "escalationStatus" | "assigneeId" | "aiHandled">>;

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

function HandoffPanel({ conversation }: { conversation: ConversationWithDetails }) {
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
  ablyClient,
  onConversationChange,
}: {
  conversation: ConversationWithDetails | null;
  productId: string;
  orgId: string;
  currentUserId: string;
  productRole: ProductRole;
  teammates: Teammate[];
  ablyClient: Ably.Realtime | null;
  onConversationChange: (patch: ConversationPatch) => void;
}) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
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
    void Promise.resolve(ch.subscribe("message", onMessage)).catch(ignoreExpectedAblyTeardown);
    return () => {
      try {
        ch.unsubscribe("message", onMessage);
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

  function handleSend() {
    const body = replyBody.trim();
    if (!body) return;
    setReplyBody("");
    startTransition(async () => {
      try {
        const saved = await sendMessage(conv.id, body);
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
        if (!conv.assigneeId) onConversationChange({ assigneeId: currentUserId, escalationStatus: "active", aiHandled: false });
      } catch (error) {
        setReplyBody(body);
        toast.error(error instanceof Error ? error.message : "Message not sent");
      }
    });
  }

  function handleTyping(value: string) {
    setReplyBody(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
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

      {canViewThread && <HandoffPanel conversation={conv} />}

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
        <div className="border-t border-border px-4 py-3">
          {!isMine && !isUnassigned && (
            <p className="mb-2 text-[11px] text-[color:var(--text-tertiary)]">
              {assigneeName ?? "A teammate"} is handling this conversation. Your reply will be sent without reassigning it.
            </p>
          )}
          {isUnassigned && !isResolved && (
            <p className="mb-2 text-[11px] text-[color:var(--text-tertiary)]">
              Replying assigns this conversation to you and pauses the AI assistant.
            </p>
          )}
          <Textarea
            placeholder="Reply…  (⌘/Ctrl + Enter to send)"
            value={replyBody}
            onChange={(e) => handleTyping(e.target.value)}
            rows={3}
            maxLength={MAX_REPLY_LENGTH}
            disabled={isPending}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[color:var(--text-tertiary)]">
              {replyBody.length}/{MAX_REPLY_LENGTH}
            </span>
            <Button
              size="sm"
              disabled={isPending || !replyBody.trim()}
              onClick={handleSend}
              className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
