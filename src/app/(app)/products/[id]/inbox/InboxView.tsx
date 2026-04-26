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
  const [conversations, setConversations] = useState(initialConversations);
  const ablyClient = useMemo(
    () =>
      new Ably.Realtime({
        authUrl: `/api/ably/token?productId=${productId}`,
        authMethod: "GET",
      }),
    [productId],
  );

  useEffect(() => {
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
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, escalationStatus: "pending" } : c,
        ),
      );
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Customer needs help", {
          body: (msg.data as { subject?: string; customerName: string }).subject
            ?? (msg.data as { customerName: string }).customerName,
        });
      }
      playNotificationSound();
    })).catch(() => {});

    void Promise.resolve(inboxCh.subscribe("conversation_updated", (msg) => {
      const d = msg.data as { conversationId: string; status: string; escalationStatus: string | null };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === d.conversationId
            ? { ...c, status: d.status, escalationStatus: d.escalationStatus }
            : c,
        ),
      );
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
        .catch(() => {})
        .finally(() => closeAblyClient(client));
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
