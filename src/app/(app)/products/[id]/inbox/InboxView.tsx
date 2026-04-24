"use client";

import { useState } from "react";

import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import type { ConversationWithDetails } from "./types";

export function InboxView({
  conversations,
}: {
  conversations: ConversationWithDetails[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ConversationThread conversation={selectedConversation} />
    </div>
  );
}
