"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Brain, ExternalLink, History, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ARTICLE_BODY, MAX_SUMMARY } from "@/lib/help-center/text";

import type { ArticleInput } from "@/lib/help-center/articles";

import { deleteArticle, restoreArticleVersion, saveArticle, setArticleStatus } from "../../actions";

type EditorArticle = ArticleInput & { id: string; status: "draft" | "published"; updatedAt: Date };

export function ArticleEditor({
  productId,
  article,
  categories,
  versions,
  publicUrlBase,
  knowledge,
}: {
  productId: string;
  article: EditorArticle;
  categories: { id: string; name: string }[];
  versions: { id: string; title: string; createdAt: Date; authorName: string | null }[];
  publicUrlBase: string | null;
  knowledge: { status: string; chunkCount: number; errorMessage: string | null } | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ArticleInput>({
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    bodyMd: article.bodyMd,
    categoryId: article.categoryId,
  });
  const [saved, setSaved] = useState<ArticleInput>(draft);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const saveRef = useRef<() => void>(() => {});

  function save(after?: () => Promise<void>) {
    startTransition(async () => {
      const result = await saveArticle(article.id, draft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const next = { ...draft, slug: result.value.slug };
      setDraft(next);
      setSaved(next);
      if (after) await after();
      else toast.success("Saved");
      router.refresh();
    });
  }

  useEffect(() => {
    saveRef.current = () => save();
  });

  // Cmd/Ctrl+S saves; warn before leaving with unsaved changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function changeStatus(status: "draft" | "published") {
    const apply = async () => {
      const result = await setArticleStatus(article.id, status);
      if (!result.ok) toast.error(result.error);
      else toast.success(status === "published" ? "Published. The AI will use it within a minute." : "Moved back to drafts");
    };
    if (dirty) save(apply);
    else startTransition(async () => {
      await apply();
      router.refresh();
    });
  }

  const publicUrl = publicUrlBase ? `${publicUrlBase}/${saved.slug}` : null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/products/${productId}/help-center`}
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Help center
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--text-tertiary)]">
            {dirty ? "Unsaved changes" : `Saved ${formatDistanceToNow(article.updatedAt, { addSuffix: true })}`}
          </span>
          {article.status === "published" && publicUrl && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
              View <ExternalLink className="size-3" />
            </a>
          )}
          <Button size="sm" variant="outline" onClick={() => save()} disabled={isPending || !dirty}>
            Save
          </Button>
          {article.status === "published" ? (
            <Button size="sm" variant="outline" onClick={() => changeStatus("draft")} disabled={isPending}>
              Unpublish
            </Button>
          ) : (
            <Button size="sm" onClick={() => changeStatus("published")} disabled={isPending}>
              Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-4">
          <Input
            aria-label="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Article title"
            className="h-12 border-0 px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
          />
          <Textarea
            aria-label="Summary"
            rows={2}
            maxLength={MAX_SUMMARY}
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            placeholder="One-sentence summary for search results and previews (optional)"
            className="text-sm"
          />
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3">
              <div className="flex">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`border-b-2 px-3 py-2 text-xs font-medium capitalize ${
                      tab === t ? "border-foreground text-foreground" : "border-transparent text-[color:var(--text-secondary)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[color:var(--text-tertiary)]">
                Markdown · {draft.bodyMd.length.toLocaleString()} / {MAX_ARTICLE_BODY.toLocaleString()}
              </span>
            </div>
            {tab === "write" ? (
              <Textarea
                aria-label="Article body"
                value={draft.bodyMd}
                onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
                placeholder={"## Overview\n\nWrite the answer customers are looking for. Use headings, lists and links."}
                className="min-h-[480px] resize-y rounded-none border-0 font-mono text-[13px] leading-6 shadow-none focus-visible:ring-0"
              />
            ) : (
              <div className="min-h-[480px] px-6 py-4 text-sm text-foreground">
                {draft.bodyMd.trim() ? <Markdown>{draft.bodyMd}</Markdown> : <p className="text-[color:var(--text-tertiary)]">Nothing to preview yet.</p>}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs text-[color:var(--text-secondary)]">Status</p>
            <p className="font-medium text-foreground capitalize">{article.status}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--text-secondary)]">Category</span>
            <select
              value={draft.categoryId ?? ""}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
              className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[color:var(--text-secondary)]">URL</span>
            <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} className="h-9 font-mono text-xs" />
          </label>

          {article.status === "published" && (
            <div className="rounded-md border border-border p-3 text-xs">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Brain className="size-3.5" /> AI knowledge
              </p>
              <p className="text-[color:var(--text-secondary)]">
                {!knowledge
                  ? "Not indexed yet."
                  : knowledge.status === "indexed"
                    ? `Indexed (${knowledge.chunkCount} chunks). The AI can answer from this article and links to it.`
                    : knowledge.status === "error"
                      ? `Indexing failed: ${knowledge.errorMessage ?? "unknown error"}`
                      : "Indexing…"}
              </p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-foreground"
            >
              <History className="size-3.5" /> Version history ({versions.length})
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-1">
                {versions.length === 0 && <li className="text-xs text-[color:var(--text-tertiary)]">No earlier versions yet.</li>}
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-xs hover:bg-[color:var(--card-elevated)]">
                    <span className="min-w-0 truncate text-[color:var(--text-secondary)]" title={v.title}>
                      {formatDistanceToNow(v.createdAt, { addSuffix: true })}
                      {v.authorName ? ` · ${v.authorName}` : ""}
                    </span>
                    <button
                      type="button"
                      aria-label="Restore this version"
                      disabled={isPending}
                      onClick={() => {
                        if (dirty && !confirm("Discard unsaved changes and restore this version?")) return;
                        startTransition(async () => {
                          const result = await restoreArticleVersion(article.id, v.id);
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          // The editor state is seeded from the server; reload to pick up the restored text.
                          window.location.reload();
                        });
                      }}
                      className="shrink-0 text-[color:var(--text-secondary)] hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-500"
            disabled={isPending}
            onClick={() => {
              if (!confirm("Delete this article? This cannot be undone.")) return;
              startTransition(async () => {
                const result = await deleteArticle(article.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Article deleted");
                router.push(`/products/${productId}/help-center`);
              });
            }}
          >
            <Trash2 className="size-3.5" /> Delete article
          </Button>
        </aside>
      </div>
    </div>
  );
}
