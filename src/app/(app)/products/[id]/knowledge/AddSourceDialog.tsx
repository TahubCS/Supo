"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { addSource, uploadSourceFile, type AddSourceInput } from "./actions";

// "file" is parsed server-side and stored as an article source.
type SourceType = AddSourceInput["type"] | "file";

const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: "article", label: "Article" },
  { id: "file", label: "File" },
  { id: "website", label: "Website" },
  { id: "url", label: "Single page" },
  { id: "github", label: "GitHub" },
];

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
  const [maxPages, setMaxPages] = useState(50);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setType("article");
    setName("");
    setUrl("");
    setContent("");
    setMaxPages(50);
    setFile(null);
  }

  const needsUrl = type !== "article" && type !== "file";

  function handleUpload() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("name", name.trim());
    startTransition(async () => {
      const result = await uploadSourceFile(productId, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("File added — indexing has started");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  function handleSubmit() {
    if (type === "file") {
      handleUpload();
      return;
    }
    if (!name.trim()) return;
    const input: AddSourceInput = {
      type,
      name: name.trim(),
      url: needsUrl ? url.trim() : undefined,
      content: type === "article" ? content.trim() : undefined,
      maxPages: type === "website" ? maxPages : undefined,
    };

    startTransition(async () => {
      try {
        await addSource(productId, input);
        toast.success("Source added — indexing has started");
        setOpen(false);
        reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add source");
      }
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
          <div className="flex overflow-hidden rounded-lg border border-border">
            {SOURCE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`${segmentBase} ${type === t.id ? segmentActive : segmentInactive}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-name" className="text-xs text-[color:var(--text-secondary)]">Name</Label>
            <Input
              id="source-name"
              placeholder={type === "website" ? "e.g. Help center" : "e.g. Getting started guide"}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {type === "file" && (
            <div className="space-y-1.5">
              <Label htmlFor="source-file" className="text-xs text-[color:var(--text-secondary)]">Document</Label>
              <Input
                id="source-file"
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt,.csv,.html,.htm"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                  if (next && !name.trim()) setName(next.name.replace(/\.[a-z0-9]+$/i, ""));
                }}
              />
              <p className="text-xs text-[color:var(--text-tertiary)]">
                PDF, Word (.docx), Markdown, text, CSV or HTML, up to 4 MB. Scanned PDFs without a text layer can&apos;t be read.
              </p>
            </div>
          )}

          {type === "article" && (
            <div className="space-y-1.5">
              <Label htmlFor="source-content" className="text-xs text-[color:var(--text-secondary)]">Content</Label>
              <Textarea
                id="source-content"
                placeholder="Paste documentation, FAQs or policies. Markdown headings (# Title) are used to split sections."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="resize-y text-sm"
              />
            </div>
          )}

          {needsUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="source-url" className="text-xs text-[color:var(--text-secondary)]">
                {type === "github" ? "Repository URL" : type === "website" ? "Website or docs URL" : "Page URL"}
              </Label>
              <Input
                id="source-url"
                type="url"
                placeholder={
                  type === "github"
                    ? "https://github.com/owner/repo"
                    : type === "website"
                      ? "https://docs.your-site.com"
                      : "https://your-site.com/help/page"
                }
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-[color:var(--text-tertiary)]">
                {type === "website" &&
                  "Pages are discovered from robots.txt / sitemap.xml, or by following links under this URL's path. Re-synced daily."}
                {type === "url" && "Only this page is indexed. Re-synced daily."}
                {type === "github" &&
                  "Indexes the README and markdown files in docs/, doc/ or guides/. Public repositories only."}
              </p>
            </div>
          )}

          {type === "website" && (
            <div className="space-y-1.5">
              <Label htmlFor="source-max-pages" className="text-xs text-[color:var(--text-secondary)]">
                Maximum pages
              </Label>
              <Input
                id="source-max-pages"
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
              />
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              (type === "file" ? !file : !name.trim()) ||
              (type === "article" && !content.trim()) ||
              (needsUrl && !url.trim())
            }
            className="w-full rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
          >
            {isPending ? "Adding…" : "Add & index"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
