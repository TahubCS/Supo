"use client";

import * as Ably from "ably";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  closeAblyClient,
  createAgentAuthCallback,
  ignoreExpectedAblyTeardown,
} from "./ably-client";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import type { ConversationWithDetails } from "./types";
import type { ProductRole } from "@/lib/product-access";

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
  currentUserId,
  productRole,
}: {
  conversations: ConversationWithDetails[];
  productId: string;
  orgId: string;
  userName: string;
  currentUserId: string;
  productRole: ProductRole;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationUpdates, setConversationUpdates] = useState<
    Record<string, Partial<ConversationWithDetails>>
  >({});
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
        .filter((conversation) => {
          if (productRole !== "agent") return true;
          return (
            conversation.assigneeId === currentUserId ||
            (conversation.escalationStatus === "pending" && !conversation.assigneeId)
          );
        })
        .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
    [currentUserId, initialConversations, productRole, conversationUpdates],
  );

  useEffect(() => {
    const client = new Ably.Realtime({
      authCallback: createAgentAuthCallback(productId),
    });
    let cancelled = false;

    // Join presence so the widget can show a live agent count.
    const presenceCh = client.channels.get(
      `org:${orgId}:product:${productId}:presence`,
    );
    const presenceEnter = Promise.resolve(presenceCh.presence.enter({ name: userName }))
      .catch(ignoreExpectedAblyTeardown);

    // Subscribe to inbox-level events for this product.
    const inboxCh = client.channels.get(
      `org:${orgId}:product:${productId}:inbox`,
    );

    const needsAgentSub = Promise.resolve(inboxCh.subscribe("needs_agent", (msg) => {
      if (cancelled) return;
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
    })).catch(ignoreExpectedAblyTeardown);

    const conversationUpdatedSub = Promise.resolve(inboxCh.subscribe("conversation_updated", (msg) => {
      if (cancelled) return;
      const d = msg.data as {
        conversationId: string;
        status: string;
        escalationStatus: string | null;
        aiHandled?: boolean;
        assigneeId?: string | null;
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
        if ("assigneeId" in d) next.assigneeId = d.assigneeId ?? null;
        if (d.lastMessageAt) next.lastMessageAt = new Date(d.lastMessageAt);
        if (d.latestMessage) {
          next.latestMessage = {
            ...d.latestMessage,
            createdAt: new Date(d.latestMessage.createdAt),
          };
        }
        return { ...prev, [d.conversationId]: next };
      });
    })).catch(ignoreExpectedAblyTeardown);

    const newConversationSub = Promise.resolve(inboxCh.subscribe("new_conversation", () => {
      if (cancelled) return;
      // New conversation not yet in local state — full server reload.
      router.refresh();
    })).catch(ignoreExpectedAblyTeardown);

    // Request browser notification permission on first inbox load.
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
      void Promise.allSettled([
        presenceEnter,
        needsAgentSub,
        conversationUpdatedSub,
        newConversationSub,
      ])
        .then(() => presenceCh.presence.leave())
        .catch(ignoreExpectedAblyTeardown)
        .finally(() => closeAblyClient(client));
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
        productId={productId}
        orgId={orgId}
        currentUserId={currentUserId}
        productRole={productRole}
      />
    </div>
  );
}
