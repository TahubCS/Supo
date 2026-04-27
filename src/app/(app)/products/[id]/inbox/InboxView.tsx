"use client";

import * as Ably from "ably";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import type { ConversationWithDetails } from "./types";

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

function closeAblyClient(client: Ably.Realtime) {
  try {
    void Promise.resolve(client.close()).catch(() => {});
  } catch {
    // Closing during Fast Refresh can race with channel attach; ignore.
  }
}

function createAgentAuthCallback(productId: string): NonNullable<Ably.AuthOptions["authCallback"]> {
  return async (_tokenParams, callback) => {
    try {
      const url = new URL("/api/ably/token", window.location.origin);
      url.searchParams.set("productId", productId);

      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        callback(`Ably token request failed with status ${response.status}`, null);
        return;
      }

      const tokenRequest = (await response.json()) as Ably.TokenRequest;
      callback(null, tokenRequest);
    } catch (error) {
      callback(error instanceof Error ? error.message : "Ably token request failed", null);
    }
  };
}

export function InboxView({
  conversations: initialConversations,
  productId,
  orgId,
  userName,
}: {
  conversations: ConversationWithDetails[];
  productId: string;
  orgId: string;
  userName: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationUpdates, setConversationUpdates] = useState<
    Record<string, Partial<ConversationWithDetails>>
  >({});
  const ablyClient = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new Ably.Realtime({
      authCallback: createAgentAuthCallback(productId),
    });
  }, [productId]);
  const conversations = useMemo(
    () =>
      initialConversations
        .map((conversation) => {
          const update = conversationUpdates[conversation.id];
          if (!update) return conversation;
          return {
            ...conversation,
            ...update,
            customer: update.customer ?? conversation.customer,
            latestMessage: update.latestMessage ?? conversation.latestMessage,
          };
        })
        .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
    [initialConversations, conversationUpdates],
  );

  useEffect(() => {
    if (!ablyClient) return;
    return () => closeAblyClient(ablyClient);
  }, [ablyClient]);

  useEffect(() => {
    if (!ablyClient) return;
    const client = ablyClient;

    // Join presence so the widget can show a live agent count.
    const presenceCh = client.channels.get(
      `org:${orgId}:product:${productId}:presence`,
    );
    void Promise.resolve(presenceCh.presence.enter({ name: userName })).catch(() => {});

    // Subscribe to inbox-level events for this product.
    const inboxCh = client.channels.get(
      `org:${orgId}:product:${productId}:inbox`,
    );

    void Promise.resolve(inboxCh.subscribe("needs_agent", (msg) => {
      const { conversationId } = msg.data as { conversationId: string; subject?: string; customerName: string };
      setConversationUpdates((prev) => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          escalationStatus: "pending",
        },
      }));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Customer needs help", {
          body: (msg.data as { subject?: string; customerName: string }).subject
            ?? (msg.data as { customerName: string }).customerName,
        });
      }
      playNotificationSound();
    })).catch(() => {});

    void Promise.resolve(inboxCh.subscribe("conversation_updated", (msg) => {
      const d = msg.data as {
        conversationId: string;
        status: string;
        escalationStatus: string | null;
        aiHandled?: boolean;
        lastMessageAt?: string;
        latestMessage?: {
          id: string;
          body: string;
          senderType: string;
          createdAt: string;
        };
      };
      setConversationUpdates((prev) => {
        const next: Partial<ConversationWithDetails> = {
          ...prev[d.conversationId],
          status: d.status,
          escalationStatus: d.escalationStatus,
        };
        if (typeof d.aiHandled === "boolean") next.aiHandled = d.aiHandled;
        if (d.lastMessageAt) next.lastMessageAt = new Date(d.lastMessageAt);
        if (d.latestMessage) {
          next.latestMessage = {
            ...d.latestMessage,
            createdAt: new Date(d.latestMessage.createdAt),
          };
        }
        return { ...prev, [d.conversationId]: next };
      });
    })).catch(() => {});

    void Promise.resolve(inboxCh.subscribe("new_conversation", () => {
      // New conversation not yet in local state — full server reload.
      router.refresh();
    })).catch(() => {});

    // Request browser notification permission on first inbox load.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      try {
        inboxCh.unsubscribe();
      } catch {
        // Channel may already be detached during Fast Refresh.
      }
      void Promise.resolve(presenceCh.presence.leave())
        .catch(() => {});
    };
  }, [ablyClient, productId, orgId, userName, router]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ConversationThread
        conversation={selectedConversation}
        ablyClient={ablyClient}
        orgId={orgId}
      />
    </div>
  );
}
