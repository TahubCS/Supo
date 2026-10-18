"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { AddSourceInput } from "@/lib/knowledge/sources";

import { addSource, uploadSourceFile } from "./actions";
import { ConfluenceSourceForm } from "./ConfluenceSourceForm";
import { GitHubSourceForm } from "./GitHubSourceForm";

type ConnectResult = { ok: boolean; message: string };

// Results of the connect round trips (see /api/integrations/*/callback),
// keyed by query parameter.
const CONNECT_RESULTS: Record<"github" | "atlassian", Record<string, ConnectResult>> = {
  github: {
    connected: { ok: true, message: "GitHub connected — choose a repository to add" },
    cancelled: { ok: false, message: "GitHub authorization was cancelled" },
    unauthorized: { ok: false, message: "Your GitHub account can't access that installation" },
    "no-installations": { ok: false, message: "Install the GitHub App first, then try again" },
    "not-configured": { ok: false, message: "The GitHub App is not configured on this server" },
    error: { ok: false, message: "Could not connect GitHub. Please try again." },
  },
  atlassian: {
    connected: { ok: true, message: "Confluence connected — choose a space to add" },
    cancelled: { ok: false, message: "Confluence authorization was cancelled" },
    "no-sites": { ok: false, message: "That Atlassian account can't read Confluence on any site" },
    "not-configured": { ok: false, message: "Confluence is not configured on this server" },
    error: { ok: false, message: "Could not connect Confluence. Please try again." },
  },
};

// "file" is parsed server-side and stored as an article source; GitHub and
// Confluence have their own forms.
type SourceType = AddSourceInput["type"] | "file" | "confluence";

const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: "article", label: "Article" },
  { id: "file", label: "File" },
  { id: "website", label: "Website" },
  { id: "url", label: "Single page" },
  { id: "github", label: "GitHub" },
  { id: "confluence", label: "Confluence" },
];

const segmentBase = "flex-1 py-1.5 text-xs font-medium transition-colors duration-150";
const segmentActive = "bg-[color:var(--card-elevated)] text-foreground";
const segmentInactive = "text-[color:var(--text-secondary)] hover:text-foreground";

export function AddSourceDialog({ productId }: { productId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const githubResult = searchParams.get("github");
  const atlassianResult = searchParams.get("atlassian");
  // Back from a connect round trip: reopen the dialog on that tab to pick what to add.
  const [returnedTo] = useState<SourceType | null>(() =>
    githubResult === "connected" || githubResult === "no-installations"
      ? "github"
      : atlassianResult === "connected"
        ? "confluence"
        : null,
  );
  const [open, setOpen] = useState(returnedTo !== null);
  const [type, setType] = useState<SourceType>(returnedTo ?? "article");

  useEffect(() => {
    if (!githubResult && !atlassianResult) return;
    const result =
      (githubResult && CONNECT_RESULTS.github[githubResult]) ||
      (atlassianResult && CONNECT_RESULTS.atlassian[atlassianResult]);
    // A fixed id keeps a re-run effect (React StrictMode) from stacking duplicates.
    if (result && result.ok) toast.success(result.message, { id: "connect-result" });
    else if (result) toast.error(result.message, { id: "connect-result" });
    router.replace(pathname);
  }, [githubResult, atlassianResult, pathname, router]);
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

  const needsUrl = type === "website" || type === "url";

  function onAdded() {
    setOpen(false);
    reset();
    router.refresh();
  }

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
    // GitHub and Confluence submit from their own forms.
    if (!name.trim() || type === "confluence") return;
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

        <div className="min-w-0 space-y-4 pt-1">
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

          {type === "github" ? (
            <GitHubSourceForm productId={productId} onAdded={onAdded} />
          ) : type === "confluence" ? (
            <ConfluenceSourceForm productId={productId} onAdded={onAdded} />
          ) : (
            <>
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
                    {type === "website" ? "Website or docs URL" : "Page URL"}
                  </Label>
                  <Input
                    id="source-url"
                    type="url"
                    placeholder={type === "website" ? "https://docs.your-site.com" : "https://your-site.com/help/page"}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <p className="text-xs text-[color:var(--text-tertiary)]">
                    {type === "website" &&
                      "Pages are discovered from robots.txt / sitemap.xml, or by following links under this URL's path. Re-synced daily."}
                    {type === "url" && "Only this page is indexed. Re-synced daily."}
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
