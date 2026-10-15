"use client";

import { formatDistanceToNow } from "date-fns";
import { Download, Flag, ShieldCheck, Tag, Trash2, User, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import type { ConversationPriority } from "@/lib/conversations/fields";

import { getCustomerProfile, setConversationPriority, setConversationTags, type CustomerProfile } from "./actions";
import { eraseCustomerData, exportCustomer } from "./privacy-actions";
import type { ConversationWithDetails } from "./types";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-red-500/40 bg-red-500/10 text-red-500",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  normal: "border-border text-[color:var(--text-secondary)]",
  low: "border-border text-[color:var(--text-tertiary)]",
};

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal") return null;
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] capitalize ${PRIORITY_STYLES[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

export function CustomerSidebar({
  conversation,
  canEdit,
  isAdmin,
  onSelectConversation,
  onChange,
  onErased,
}: {
  conversation: ConversationWithDetails;
  canEdit: boolean;
  isAdmin: boolean;
  onErased: () => void;
  onSelectConversation: (id: string) => void;
  onChange: (patch: Partial<Pick<ConversationWithDetails, "priority" | "tags">>) => void;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    getCustomerProfile(conversation.id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canEdit, conversation.id]);

  function updatePriority(priority: ConversationPriority) {
    onChange({ priority });
    startTransition(async () => {
      try {
        await setConversationPriority(conversation.id, priority);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update priority");
      }
    });
  }

  function updateTags(tags: string[]) {
    onChange({ tags });
    startTransition(async () => {
      try {
        onChange({ tags: await setConversationTags(conversation.id, tags) });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update tags");
      }
    });
  }

  if (!canEdit) return null;

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-card p-4 xl:flex">
      <section>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-tertiary)]">
          <Flag className="size-3" /> Priority
        </p>
        <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border">
          {(["low", "normal", "high", "urgent"] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={isPending}
              onClick={() => updatePriority(p)}
              className={`py-1 text-[11px] capitalize ${
                conversation.priority === p
                  ? "bg-[color:var(--card-elevated)] font-medium text-foreground"
                  : "text-[color:var(--text-secondary)] hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-tertiary)]">
          <Tag className="size-3" /> Tags
        </p>
        <div className="flex flex-wrap gap-1">
          {conversation.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => updateTags(conversation.tags.filter((t) => t !== tag))}
                className="text-[color:var(--text-tertiary)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) {
              e.preventDefault();
              updateTags([...conversation.tags, tagDraft.trim()]);
              setTagDraft("");
            }
          }}
          placeholder="Add tag…"
          className="mt-2 h-8 text-xs"
        />
      </section>

      <section>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-tertiary)]">
          <User className="size-3" /> Customer
        </p>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--text-tertiary)]">Name</dt>
            <dd className="truncate text-foreground">{conversation.customer.name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--text-tertiary)]">Email</dt>
            <dd className="truncate text-foreground">{conversation.customer.email ?? conversation.followUpEmail ?? "—"}</dd>
          </div>
          {profile?.externalId && (
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--text-tertiary)]">User ID</dt>
              <dd className="truncate font-mono text-foreground">{profile.externalId}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--text-tertiary)]">Identity</dt>
            <dd className={conversation.identityVerified ? "text-emerald-500" : "text-[color:var(--text-secondary)]"}>
              {conversation.identityVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
          {profile?.locale && (
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--text-tertiary)]">Locale</dt>
              <dd className="text-foreground">{profile.locale}</dd>
            </div>
          )}
          {profile?.timezone && (
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--text-tertiary)]">Timezone</dt>
              <dd className="truncate text-foreground">{profile.timezone}</dd>
            </div>
          )}
          {profile && (
            <div className="flex justify-between gap-2">
              <dt className="text-[color:var(--text-tertiary)]">First seen</dt>
              <dd className="text-foreground">{formatDistanceToNow(profile.createdAt, { addSuffix: true })}</dd>
            </div>
          )}
        </dl>
      </section>

      {profile && profile.conversations.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-tertiary)]">
            Previous conversations
          </p>
          <ul className="space-y-1">
            {profile.conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectConversation(c.id)}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-[color:var(--card-elevated)]"
                >
                  <p className="truncate text-xs text-foreground">{c.subject ?? "Conversation"}</p>
                  <p className="text-[10px] capitalize text-[color:var(--text-tertiary)]">
                    {c.status} · {formatDistanceToNow(c.lastMessageAt, { addSuffix: true })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-tertiary)]">
            <ShieldCheck className="size-3" /> Privacy
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const json = await exportCustomer(conversation.productId, conversation.customer.id);
                    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `customer-${conversation.customer.id}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Export failed");
                  }
                })
              }
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-[color:var(--card-elevated)]"
            >
              <Download className="size-3.5" /> Export customer data
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                const typed = prompt(
                  `This permanently deletes ${conversation.customer.name} and all of their conversations in every product. Type ERASE to confirm.`,
                );
                if (typed !== "ERASE") return;
                startTransition(async () => {
                  try {
                    const result = await eraseCustomerData(conversation.productId, conversation.customer.id);
                    toast.success(`Customer erased (${result.conversations} conversation${result.conversations === 1 ? "" : "s"})`);
                    onErased();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Erase failed");
                  }
                });
              }}
              className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="size-3.5" /> Erase customer
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
