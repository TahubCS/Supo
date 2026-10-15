"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProductRole } from "@/lib/product-access";
import { inboxChannelName, presenceChannelName } from "@/lib/realtime-channels";

import { getConversationForInbox, listMacros, wakeDueSnoozes, type MacroSummary, type Teammate } from "./actions";
import { closeAblyClient, createAgentAuthCallback, ignoreExpectedAblyTeardown } from "./ably-client";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import type { ConversationWithDetails } from "./types";

const FALLBACK_REFRESH_MS = 15_000;

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Web Audio unavailable — silent fail.
  }
}

const DATE_FIELDS = ["snoozedUntil", "firstResponseAt", "firstResponseDueAt", "resolutionDueAt", "resolvedAt"] as const;
type DateField = (typeof DATE_FIELDS)[number];

type ConversationPatch = Partial<Omit<ConversationWithDetails, "lastMessageAt" | "latestMessage" | DateField>> & {
  lastMessageAt?: string;
} & Partial<Record<DateField, string | null>> & {
  latestMessage?: { id: string; body: string; senderType: string; createdAt: string };
};

const PATCHABLE_FIELDS = [
  "priority",
  "tags",
  "status",
  "escalationStatus",
  "assigneeId",
  "aiHandled",
  "aiSummary",
  "handoffReason",
  "followUpEmail",
  "rating",
] as const;

function applyPatch(conversation: ConversationWithDetails, patch: ConversationPatch): ConversationWithDetails {
  const next: ConversationWithDetails = { ...conversation };
  for (const field of PATCHABLE_FIELDS) {
    if (field in patch) (next as Record<string, unknown>)[field] = patch[field] ?? null;
  }
  if (patch.lastMessageAt) next.lastMessageAt = new Date(patch.lastMessageAt);
  for (const field of DATE_FIELDS) {
    if (field in patch) next[field] = patch[field] ? new Date(patch[field]) : null;
  }
  if (patch.latestMessage) {
    next.latestMessage = { ...patch.latestMessage, createdAt: new Date(patch.latestMessage.createdAt) };
  }
  return next;
}

export function InboxView({
  conversations: serverConversations,
  productId,
  orgId,
  userName,
  currentUserId,
  productRole,
  teammates,
  initialSelectedId,
  realtimeEnabled,
}: {
  conversations: ConversationWithDetails[];
  productId: string;
  orgId: string;
  userName: string;
  currentUserId: string;
  productRole: ProductRole;
  teammates: Teammate[];
  initialSelectedId: string | null;
  realtimeEnabled: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [macros, setMacros] = useState<MacroSummary[]>([]);

  useEffect(() => {
    listMacros(productId).then(setMacros).catch(() => {});
  }, [productId]);

  // One realtime connection for the whole inbox, shared with the open thread.
  // Created lazily on the client (never during SSR) and connected in an effect.
  const [ablyClient] = useState<Ably.Realtime | null>(() =>
    typeof window !== "undefined" && realtimeEnabled
      ? new Ably.Realtime({ authCallback: createAgentAuthCallback(productId), autoConnect: false })
      : null,
  );

  // Live state is layered over the server snapshot and discarded whenever a
  // fresh snapshot arrives (router.refresh()).
  const [live, setLive] = useState<{
    base: ConversationWithDetails[];
    patches: Record<string, ConversationPatch>;
    added: ConversationWithDetails[];
  }>({ base: serverConversations, patches: {}, added: [] });
  const liveState = useMemo(
    () => (live.base === serverConversations ? live : { base: serverConversations, patches: {}, added: [] }),
    [live, serverConversations],
  );

  const conversations = useMemo(() => {
    const known = new Set(liveState.base.map((c) => c.id));
    return [...liveState.base, ...liveState.added.filter((c) => !known.has(c.id))]
      .map((c) => (liveState.patches[c.id] ? applyPatch(c, liveState.patches[c.id]) : c))
      .filter((c) => {
        if (productRole !== "agent") return true;
        return c.assigneeId === currentUserId || (c.escalationStatus === "pending" && !c.assigneeId);
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }, [liveState, productRole, currentUserId]);

  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set([...liveState.base, ...liveState.added].map((c) => c.id));
  }, [liveState]);
  const fetching = useRef(new Set<string>());

  const patchConversation = useCallback(
    (conversationId: string, patch: ConversationPatch) => {
      setLive((prev) => {
        const current = prev.base === serverConversations ? prev : { base: serverConversations, patches: {}, added: [] };
        return {
          ...current,
          patches: { ...current.patches, [conversationId]: { ...current.patches[conversationId], ...patch } },
        };
      });
    },
    [serverConversations],
  );

  // Realtime may announce conversations this page hasn't loaded yet (new chats,
  // fresh escalations for agents). Fetch just that one and add it to the list.
  const ensureConversation = useCallback(
    async (conversationId: string) => {
      if (knownIds.current.has(conversationId) || fetching.current.has(conversationId)) return;
      fetching.current.add(conversationId);
      try {
        const loaded = await getConversationForInbox(conversationId);
        if (!loaded) return;
        setLive((prev) => {
          const current = prev.base === serverConversations ? prev : { base: serverConversations, patches: {}, added: [] };
          if (current.added.some((c) => c.id === loaded.id)) return current;
          return { ...current, added: [...current.added, loaded] };
        });
      } finally {
        fetching.current.delete(conversationId);
      }
    },
    [serverConversations],
  );

  useEffect(() => {
    if (!ablyClient) return;
    let cancelled = false;
    ablyClient.connect();

    // Presence tells customers whether an agent is online.
    const presenceCh = ablyClient.channels.get(presenceChannelName(orgId, productId));
    const presenceEnter = Promise.resolve(presenceCh.presence.enter({ name: userName })).catch(
      ignoreExpectedAblyTeardown,
    );

    const inboxCh = ablyClient.channels.get(inboxChannelName(orgId, productId));

    const needsAgentSub = Promise.resolve(
      inboxCh.subscribe("needs_agent", (msg) => {
        if (cancelled) return;
        const d = msg.data as { conversationId: string; subject?: string | null; customerName?: string; reason?: string };
        patchConversation(d.conversationId, { escalationStatus: "pending", assigneeId: null });
        void ensureConversation(d.conversationId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const notification = new Notification(`${d.customerName ?? "A customer"} needs help`, {
            body: [d.reason, d.subject].filter(Boolean).join(" — "),
            tag: `supo-${d.conversationId}`,
          });
          notification.onclick = () => {
            window.focus();
            setSelectedId(d.conversationId);
          };
        }
        playNotificationSound();
      }),
    ).catch(ignoreExpectedAblyTeardown);

    const updatedSub = Promise.resolve(
      inboxCh.subscribe("conversation_updated", (msg) => {
        if (cancelled) return;
        const d = msg.data as ConversationPatch & { conversationId: string };
        const { conversationId, ...patch } = d;
        patchConversation(conversationId, patch);
        void ensureConversation(conversationId);
      }),
    ).catch(ignoreExpectedAblyTeardown);

    const assignedSub = Promise.resolve(
      inboxCh.subscribe("conversation_assigned", (msg) => {
        if (cancelled) return;
        const d = msg.data as { conversationId: string; assigneeId: string; customerName?: string; subject?: string | null };
        patchConversation(d.conversationId, { assigneeId: d.assigneeId, escalationStatus: "active" });
        void ensureConversation(d.conversationId);
        if (d.assigneeId !== currentUserId) return;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const notification = new Notification(`New conversation assigned: ${d.customerName ?? "customer"}`, {
            body: d.subject ?? undefined,
            tag: `supo-${d.conversationId}`,
          });
          notification.onclick = () => {
            window.focus();
            setSelectedId(d.conversationId);
          };
        }
        playNotificationSound();
      }),
    ).catch(ignoreExpectedAblyTeardown);

    const newConversationSub = Promise.resolve(
      inboxCh.subscribe("new_conversation", (msg) => {
        if (cancelled) return;
        void ensureConversation((msg.data as { conversationId: string }).conversationId);
      }),
    ).catch(ignoreExpectedAblyTeardown);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      cancelled = true;
      try {
        inboxCh.unsubscribe();
      } catch {
        // Channel may already be detached during Fast Refresh.
      }
      void Promise.allSettled([presenceEnter, needsAgentSub, updatedSub, assignedSub, newConversationSub])
        .then(() => presenceCh.presence.leave())
        .catch(ignoreExpectedAblyTeardown)
        .finally(() => closeAblyClient(ablyClient));
    };
  }, [ablyClient, currentUserId, ensureConversation, orgId, patchConversation, productId, userName]);

  // Wake snoozed conversations when their timer runs out (the server page
  // load does this too, but realtime sessions may never reload).
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const due = conversationsRef.current.some(
        (c) => c.status === "snoozed" && c.snoozedUntil && c.snoozedUntil.getTime() <= now,
      );
      if (!due) return;
      wakeDueSnoozes(productId)
        .then((ids) => ids.forEach((id) => patchConversation(id, { status: "open", snoozedUntil: null })))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [patchConversation, productId]);

  // Without realtime, keep the list reasonably fresh by polling the server.
  useEffect(() => {
    if (ablyClient) return;
    const timer = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [ablyClient, router]);

  const loadConversation = useCallback((id: string) => void ensureConversation(id), [ensureConversation]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        currentUserId={currentUserId}
        productId={productId}
        onLoadConversation={loadConversation}
        onResolved={(ids) =>
          ids.forEach((id) =>
            patchConversation(id, { status: "resolved", escalationStatus: null, assigneeId: null, aiHandled: true }),
          )
        }
      />
      <ConversationThread
        key={selectedConversation?.id ?? "none"}
        conversation={selectedConversation}
        productId={productId}
        orgId={orgId}
        currentUserId={currentUserId}
        productRole={productRole}
        teammates={teammates}
        macros={macros}
        ablyClient={ablyClient}
        onConversationChange={(patch) => selectedConversation && patchConversation(selectedConversation.id, patch)}
        onSelectConversation={(id) => {
          setSelectedId(id);
          void ensureConversation(id);
        }}
      />
    </div>
  );
}
