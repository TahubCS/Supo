"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { addSource, type AddSourceInput } from "./actions";

type SourceType = "article" | "url" | "github";

const segmentBase = "flex-1 py-1.5 text-xs font-medium transition-colors duration-150";
const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
const segmentInactive = "text-[color:var(--text-secondary)] hover:text-foreground";

export function AddSourceDialog({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SourceType>("article");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setType("article");
    setName("");
    setUrl("");
    setContent("");
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const input: AddSourceInput = {
      type,
      name: name.trim(),
      url: (type === "url" || type === "github") ? url.trim() : undefined,
      content: type === "article" ? content.trim() : undefined,
    };

    startTransition(async () => {
      await addSource(productId, input);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90">
          Add source
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add knowledge source</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Type selector */}
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["article", "url", "github"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`${segmentBase} capitalize ${type === t ? segmentActive : segmentInactive}`}
              >
                {t === "github" ? "GitHub" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-[color:var(--text-secondary)]">Name</Label>
            <Input
              placeholder="e.g. Getting started guide"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Type-specific field */}
          {type === "article" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[color:var(--text-secondary)]">Content</Label>
              <Textarea
                placeholder="Paste your documentation, FAQ, or any text the AI should learn from…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="resize-none text-sm"
              />
            </div>
          )}

          {type === "url" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[color:var(--text-secondary)]">URL</Label>
              <Input
                type="url"
                placeholder="https://your-docs-site.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          {type === "github" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[color:var(--text-secondary)]">Repository URL</Label>
              <Input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-[color:var(--text-tertiary)]">
                Indexes README + files in <code className="font-mono">docs/</code> folder. Works with public repos.
              </p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              !name.trim() ||
              (type === "article" && !content.trim()) ||
              ((type === "url" || type === "github") && !url.trim())
            }
            className="w-full rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
          >
            {isPending ? "Indexing…" : "Add & Index"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
