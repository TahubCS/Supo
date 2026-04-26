"use client";

import * as Ably from "ably";
import { useEffect, useRef, useState } from "react";
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
  // Stable ref to the Ably client so children can subscribe to conversation channels.
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const [ablyClient, setAblyClient] = useState<Ably.Realtime | null>(null);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: `/api/ably/token?productId=${productId}`,
      authMethod: "GET",
    });
    ablyRef.current = client;
    setAblyClient(client);

    // Join presence so the widget can show a live agent count.
    const presenceCh = client.channels.get(
      `org:${orgId}:product:${productId}:presence`,
    );
    presenceCh.presence.enter({ name: userName }).catch(() => {});

    // Subscribe to inbox-level events for this product.
    const inboxCh = client.channels.get(
      `org:${orgId}:product:${productId}:inbox`,
    );

    inboxCh.subscribe("needs_agent", (msg) => {
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
    });

    inboxCh.subscribe("conversation_updated", (msg) => {
      const d = msg.data as { conversationId: string; status: string; escalationStatus: string | null };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === d.conversationId
            ? { ...c, status: d.status, escalationStatus: d.escalationStatus }
            : c,
        ),
      );
    });

    inboxCh.subscribe("new_conversation", () => {
      // New conversation not yet in local state — full server reload.
      router.refresh();
    });

    // Request browser notification permission on first inbox load.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      inboxCh.unsubscribe();
      presenceCh.presence.leave().catch(() => {});
      client.close();
      ablyRef.current = null;
      setAblyClient(null);
    };
  }, [productId, orgId, userName, router]);

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
