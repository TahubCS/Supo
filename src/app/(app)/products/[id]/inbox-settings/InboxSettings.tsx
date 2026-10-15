"use client";

import { Pencil, Plus, Shuffle, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { MacroActions } from "@/db/schema";

import { createMacro, deleteMacro, saveRoutingSettings, updateMacro } from "./actions";

type MacroRow = {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  actions: MacroActions | null;
  usageCount: number;
};

const PRIORITIES = ["", "low", "normal", "high", "urgent"] as const;

function MacroDialog({
  productId,
  macro,
  open,
  onOpenChange,
}: {
  productId: string;
  macro: MacroRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(macro?.title ?? "");
  const [shortcut, setShortcut] = useState(macro?.shortcut ?? "");
  const [body, setBody] = useState(macro?.body ?? "");
  const [resolve, setResolve] = useState(macro?.actions?.status === "resolved");
  const [priority, setPriority] = useState<string>(macro?.actions?.priority ?? "");
  const [tags, setTags] = useState((macro?.actions?.addTags ?? []).join(", "));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const input = {
      title,
      shortcut,
      body,
      actions: {
        status: resolve ? ("resolved" as const) : undefined,
        priority: (priority || undefined) as MacroActions["priority"],
        addTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      },
    };
    startTransition(async () => {
      try {
        if (macro) await updateMacro(macro.id, input);
        else await createMacro(productId, input);
        toast.success(macro ? "Macro updated" : "Macro created");
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save macro");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{macro ? "Edit macro" : "New macro"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="macro-title" className="text-xs text-[color:var(--text-secondary)]">Title</Label>
              <Input id="macro-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Refund approved" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="macro-shortcut" className="text-xs text-[color:var(--text-secondary)]">Shortcut</Label>
              <Input id="macro-shortcut" value={shortcut} maxLength={32} onChange={(e) => setShortcut(e.target.value)} placeholder="refund" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="macro-body" className="text-xs text-[color:var(--text-secondary)]">Reply</Label>
            <Textarea
              id="macro-body"
              value={body}
              rows={6}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{customer.first_name}}, I've processed your refund…\n\n{{agent.first_name}}"}
              className="text-sm"
            />
            <p className="text-[11px] text-[color:var(--text-tertiary)]">
              Variables: {"{{customer.name}}"}, {"{{customer.first_name}}"}, {"{{customer.email}}"}, {"{{agent.name}}"}, {"{{agent.first_name}}"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="macro-priority" className="text-xs text-[color:var(--text-secondary)]">Set priority</Label>
              <select
                id="macro-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p ? p[0].toUpperCase() + p.slice(1) : "Don't change"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="macro-tags" className="text-xs text-[color:var(--text-secondary)]">Add tags</Label>
              <Input id="macro-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="billing, refund" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={resolve} onCheckedChange={setResolve} />
            Resolve the conversation after sending
          </label>
          <Button onClick={handleSave} disabled={isPending || !title.trim() || !body.trim()} className="w-full text-xs">
            {isPending ? "Saving…" : "Save macro"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InboxSettings({
  productId,
  routingMode: initialRoutingMode,
  maxConcurrentChats: initialMax,
  macros,
}: {
  productId: string;
  routingMode: "manual" | "round_robin";
  maxConcurrentChats: number;
  macros: MacroRow[];
}) {
  const router = useRouter();
  const [routingMode, setRoutingMode] = useState(initialRoutingMode);
  const [maxConcurrent, setMaxConcurrent] = useState(initialMax);
  const [editing, setEditing] = useState<MacroRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function saveRouting() {
    startTransition(async () => {
      try {
        await saveRoutingSettings(productId, { routingMode, maxConcurrentChats: maxConcurrent });
        toast.success("Routing saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save routing");
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-start gap-3">
          <Shuffle className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
          <div>
            <p className="text-sm font-medium text-foreground">Routing</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
              With round robin, conversations that need a person are assigned automatically to the least busy agent
              who has the inbox open. Otherwise agents claim them from the Waiting queue.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["manual", "round_robin"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRoutingMode(mode)}
                className={`px-4 py-1.5 text-xs font-medium ${
                  routingMode === mode
                    ? "bg-[color:var(--card-elevated)] text-foreground"
                    : "text-[color:var(--text-secondary)] hover:text-foreground"
                }`}
              >
                {mode === "manual" ? "Manual (claim)" : "Round robin"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-concurrent" className="text-xs text-[color:var(--text-secondary)]">
              Max active chats per agent
            </Label>
            <Input
              id="max-concurrent"
              type="number"
              min={1}
              max={50}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value) || 1)}
              className="w-28"
              disabled={routingMode === "manual"}
            />
          </div>
          <Button size="sm" onClick={saveRouting} disabled={isPending} className="ml-auto text-xs">
            Save
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
            <div>
              <p className="text-sm font-medium text-foreground">Macros</p>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
                Saved replies. Type <code>/</code> in the reply box to insert one. Macros can also set priority, add
                tags and resolve the conversation.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="gap-1 text-xs"
          >
            <Plus className="size-3.5" /> New macro
          </Button>
        </div>
        {macros.length === 0 ? (
          <p className="py-8 text-center text-xs text-[color:var(--text-tertiary)]">No macros yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {macros.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {m.title}
                    {m.shortcut && <span className="ml-2 font-mono text-xs text-[color:var(--text-tertiary)]">/{m.shortcut}</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--text-secondary)]">{m.body}</p>
                  <p className="mt-1 text-[10px] text-[color:var(--text-tertiary)]">
                    Used {m.usageCount}×
                    {m.actions?.status === "resolved" ? " · resolves" : ""}
                    {m.actions?.priority ? ` · priority ${m.actions.priority}` : ""}
                    {m.actions?.addTags?.length ? ` · tags ${m.actions.addTags.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Edit macro"
                    onClick={() => {
                      setEditing(m);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:text-[color:var(--status-error)]"
                    aria-label="Delete macro"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteMacro(m.id);
                        toast.success("Macro deleted");
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialogOpen && (
        <MacroDialog
          key={editing?.id ?? "new"}
          productId={productId}
          macro={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
