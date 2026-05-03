"use client";

import * as Ably from "ably";
import { format, isSameDay } from "date-fns";
import { BookOpen, MessageSquare, UserCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ProductRole } from "@/lib/product-access";

import {
  closeAblyClient,
  createAgentAuthCallback,
  ignoreExpectedAblyTeardown,
} from "./ably-client";
import {
  getMessages,
  joinConversation,
  learnFromConversation,
  resolveConversation,
  reopenConversation,
  sendMessage,
  snoozeConversation,
} from "./actions";
import type { ConversationWithDetails } from "./types";

type MessageRow = {
  id: string;
  conversationId: string;
  body: string;
  senderType: string;
  senderId: string | null;
  createdAt: Date;
};

function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] text-[color:var(--text-tertiary)]">
        {format(date, "MMMM d, yyyy")}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const isAgent = msg.senderType === "agent";
  const isAI = msg.senderType === "ai";

  if (isAgent) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] space-y-1">
          <div className="rounded-lg bg-foreground px-3 py-2 text-sm text-background">
            {msg.body}
          </div>
          <p className="text-right text-[10px] text-[color:var(--text-tertiary)]">
            {format(msg.createdAt, "h:mm a")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] space-y-1">
        {isAI && (
          <p className="text-[10px] font-medium text-[color:var(--text-tertiary)]">AI</p>
        )}
        <div
          className={`rounded-lg border border-border px-3 py-2 text-sm ${
            isAI ? "bg-[color:var(--card-elevated)]" : "bg-card"
          } text-foreground`}
        >
          {msg.body}
        </div>
        <p className="text-[10px] text-[color:var(--text-tertiary)]">
          {format(msg.createdAt, "h:mm a")}
        </p>
      </div>
    </div>
  );
}

export function ConversationThread({
  conversation,
  productId,
  orgId,
  currentUserId,
  productRole,
}: {
  conversation: ConversationWithDetails | null;
  productId: string;
  orgId: string;
  currentUserId: string;
  productRole: ProductRole;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationId = conversation?.id ?? null;
  const canViewThread =
    !conversation ||
    productRole !== "agent" ||
    conversation.assigneeId === currentUserId;
  const ablyClient = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new Ably.Realtime({
      authCallback: createAgentAuthCallback(productId),
    });
  }, [productId]);

  useEffect(() => {
    if (!ablyClient) return;
    return () => closeAblyClient(ablyClient);
  }, [ablyClient]);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!conversationId || !canViewThread) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      const msgs = await getMessages(conversationId);
      if (!cancelled) {
        setMessages(msgs as MessageRow[]);
        setLoadingMessages(false);
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [canViewThread, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Subscribe to real-time messages on the conversation channel.
  useEffect(() => {
    if (!ablyClient || !conversationId || !canViewThread) return;
    const ch = ablyClient.channels.get(`org:${orgId}:conversation:${conversationId}`);

    function onMessage(msg: Ably.Message) {
      const d = msg.data as {
        id: string;
        body: string;
        senderType: string;
        createdAt: string;
      };
      setMessages((prev) => {
        // Dedup: the sender already has this message from getMessages() refetch.
        if (prev.some((m) => m.id === d.id)) return prev;
        return [
          ...prev,
          {
            id: d.id,
            conversationId: conversationId!,
            body: d.body,
            senderType: d.senderType,
            senderId: null,
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
  }, [ablyClient, canViewThread, conversationId, orgId]);

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <MessageSquare className="size-8 text-[color:var(--text-tertiary)]" />
        <p className="text-sm text-[color:var(--text-secondary)]">
          Select a conversation
        </p>
      </div>
    );
  }

  function handleResolve() {
    if (!conversation) return;
    startTransition(async () => {
      await resolveConversation(conversation.id);
      router.refresh();
    });
  }

  function handleSnooze() {
    if (!conversation) return;
    startTransition(async () => {
      await snoozeConversation(conversation.id);
      router.refresh();
    });
  }

  function handleReopen() {
    if (!conversation) return;
    startTransition(async () => {
      await reopenConversation(conversation.id);
      router.refresh();
    });
  }

  function handleJoin() {
    if (!conversation) return;
    startTransition(async () => {
      await joinConversation(conversation.id);
      router.refresh();
    });
  }

  function handleLearn() {
    if (!conversation) return;
    startTransition(async () => {
      try {
        const result = await learnFromConversation(conversation.id);
        toast.success(
          result === "existing"
            ? "Knowledge suggestion already exists"
            : "Knowledge suggestion created",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create knowledge suggestion");
      }
    });
  }

  function handleSend() {
    if (!conversation || !replyBody.trim()) return;
    const body = replyBody.trim();
    setReplyBody("");
    startTransition(async () => {
      await sendMessage(conversation.id, body);
      const updated = await getMessages(conversation.id);
      setMessages(updated as MessageRow[]);
      router.refresh();
    });
  }

  const isResolved = conversation.status === "resolved";
  const isAgent = productRole === "agent";
  const canManageConversation = !isAgent || conversation.assigneeId === currentUserId;
  const isUnassignedPending =
    isAgent &&
    conversation.escalationStatus === "pending" &&
    !conversation.assigneeId;

  // Group messages with date separators
  const grouped: Array<{ separator: Date } | { msg: MessageRow }> = [];
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
      {/* Sticky header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {conversation.customer.name}
              </span>
              {conversation.status === "open" ? (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal"
                >
                  Open
                </Badge>
              ) : conversation.status === "resolved" ? (
                <Badge className="h-4 shrink-0 rounded-full bg-foreground px-1.5 text-[10px] font-normal text-background hover:bg-foreground">
                  Resolved
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal text-[color:var(--text-secondary)]"
                >
                  Snoozed
                </Badge>
              )}
              {conversation.escalationStatus === "pending" && (
                <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-500">
                  Needs Agent
                </span>
              )}
              {conversation.escalationStatus === "active" && (
                <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-500">
                  Agent Active
                </span>
              )}
              {!conversation.escalationStatus && conversation.aiHandled && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-tertiary)]">
                  AI
                </span>
              )}
            </div>
            <p className="text-xs text-[color:var(--text-secondary)] truncate">
              {conversation.customer.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isUnassignedPending ? (
            <Button
              size="sm"
              disabled={isPending}
              onClick={handleJoin}
              className="gap-1.5 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
            >
              <UserCheck className="size-3.5" />
              Join
            </Button>
          ) : !canManageConversation ? null : isResolved ? (
            <div className="flex items-center gap-2">
              {!isAgent && (
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
                onClick={handleReopen}
                className="rounded-lg border-border text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:text-foreground"
              >
                Reopen
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleSnooze}
                className="rounded-lg border-border text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:text-foreground"
              >
                Snooze
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={handleResolve}
                className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
              >
                Resolve
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scroll-smooth px-5 py-4">
        {isUnassignedPending ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm space-y-3 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-card">
                <UserCheck className="size-5 text-[color:var(--text-secondary)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Join to handle this conversation
                </p>
                <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                  The full thread unlocks after you claim it, so pending queues stay private between agents.
                </p>
              </div>
              <Button
                size="sm"
                disabled={isPending}
                onClick={handleJoin}
                className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
              >
                Join conversation
              </Button>
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

      {canManageConversation && (
        <div className="border-t border-border px-4 py-3">
        <Textarea
          placeholder="Reply…"
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={3}
          maxLength={2000}
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
            {replyBody.length}/2000
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
