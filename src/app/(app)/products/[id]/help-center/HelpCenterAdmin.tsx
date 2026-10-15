"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileUp,
  FolderOpen,
  Globe,
  Pencil,
  Plus,
  Search,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  createArticle,
  deleteCategory,
  importArticleFromFile,
  moveCategory,
  saveCategory,
  saveHelpCenterSettings,
  type HelpCenterSettingsInput,
} from "./actions";

type Category = { id: string; name: string; description: string };
type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  categoryId: string | null;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  updatedAt: Date;
};

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5 first:mt-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SettingsSection({
  productId,
  settings: initial,
  publicUrl,
}: {
  productId: string;
  settings: HelpCenterSettingsInput;
  publicUrl: string | null;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveHelpCenterSettings(productId, settings);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(settings.enabled ? "Help center is live" : "Help center saved");
      router.refresh();
    });
  }

  return (
    <Section
      icon={Globe}
      title="Public help center"
      description="A searchable site with your published articles. Published articles also power AI answers, and the AI links customers to them."
      action={
        publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground hover:underline"
          >
            View site <ExternalLink className="size-3" />
          </a>
        ) : null
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-[color:var(--text-secondary)]">Title</span>
          <Input value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[color:var(--text-secondary)]">Address</span>
          <div className="flex items-center rounded-md border border-border pl-2.5 text-xs text-[color:var(--text-tertiary)]">
            /help/
            <input
              value={settings.slug}
              onChange={(e) => setSettings({ ...settings, slug: e.target.value.toLowerCase() })}
              className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none"
            />
          </div>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs text-[color:var(--text-secondary)]">Description (shown on the home page and in search results)</span>
          <Textarea
            rows={2}
            value={settings.description}
            onChange={(e) => setSettings({ ...settings, description: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={settings.enabled} onCheckedChange={(enabled) => setSettings({ ...settings, enabled })} />
          Published
        </label>
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </Section>
  );
}

function CategoriesSection({ productId, categories, counts }: { productId: string; categories: Category[]; counts: Map<string, number> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  return (
    <Section icon={FolderOpen} title="Categories" description="Group articles into sections on the help center home page.">
      {categories.length > 0 && (
        <ul className="mb-3 divide-y divide-border rounded-md border border-border">
          {categories.map((category, index) => (
            <li key={category.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === category.id ? (
                <Input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      run(() => saveCategory(productId, { id: category.id, name: editing.name }), "Category renamed");
                      setEditing(null);
                    }
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="h-8"
                />
              ) : (
                <span className="flex-1 text-foreground">
                  {category.name}
                  <span className="ml-2 text-xs text-[color:var(--text-tertiary)]">{counts.get(category.id) ?? 0} articles</span>
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" disabled={isPending || index === 0} aria-label="Move up" onClick={() => run(() => moveCategory(productId, category.id, "up"))}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={isPending || index === categories.length - 1}
                  aria-label="Move down"
                  onClick={() => run(() => moveCategory(productId, category.id, "down"))}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Rename" onClick={() => setEditing({ id: category.id, name: category.name })}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Delete"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(`Delete "${category.name}"? Its articles become uncategorized.`)) {
                      run(() => deleteCategory(productId, category.id), "Category deleted");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => saveCategory(productId, { name }), "Category added");
          setName("");
        }}
      >
        <Input placeholder="New category, e.g. Billing" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        <Button type="submit" size="sm" variant="outline" disabled={isPending || !name.trim()}>
          <Plus className="size-3.5" /> Add
        </Button>
      </form>
    </Section>
  );
}

export function HelpCenterAdmin({
  productId,
  settings,
  publicUrl,
  categories,
  articles,
}: {
  productId: string;
  settings: HelpCenterSettingsInput;
  publicUrl: string | null;
  categories: Category[];
  articles: ArticleRow[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [isPending, startTransition] = useTransition();
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) if (a.categoryId) map.set(a.categoryId, (map.get(a.categoryId) ?? 0) + 1);
    return map;
  }, [articles]);

  const visible = articles.filter(
    (a) =>
      (statusFilter === "all" || a.status === statusFilter) &&
      (!query.trim() || a.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  function openNew(result: { ok: true; value: string } | { ok: false; error: string }) {
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/products/${productId}/help-center/articles/${result.value}`);
  }

  return (
    <div>
      <SettingsSection productId={productId} settings={settings} publicUrl={publicUrl} />
      <CategoriesSection productId={productId} categories={categories} counts={counts} />

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
              <Input placeholder="Search articles" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8 text-xs" />
            </div>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-xs text-[color:var(--text-secondary)]"
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,.csv,.html,.htm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const form = new FormData();
                form.set("file", file);
                startTransition(async () => {
                  const result = await importArticleFromFile(productId, form);
                  if (result.ok) toast.success(`Imported "${file.name}" as a draft`);
                  openNew(result);
                });
              }}
            />
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => fileInput.current?.click()}>
              <FileUp className="size-3.5" /> Import file
            </Button>
            <Button size="sm" disabled={isPending} onClick={() => startTransition(async () => openNew(await createArticle(productId)))}>
              <Plus className="size-3.5" /> New article
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-[color:var(--text-secondary)]">
            {articles.length === 0 ? "No articles yet. Write one, or import a PDF, Word or Markdown file." : "No articles match."}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[color:var(--text-tertiary)]">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Views</th>
                <th className="px-4 py-2 text-right font-medium">Helpful</th>
                <th className="px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const votes = a.helpfulCount + a.notHelpfulCount;
                return (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-[color:var(--card-elevated)]">
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${productId}/help-center/articles/${a.id}`} className="font-medium text-foreground hover:underline">
                        {a.title}
                      </Link>
                      {a.status === "draft" && (
                        <span className="ml-2 rounded-full border border-border px-1.5 py-px text-[10px] text-[color:var(--text-tertiary)]">Draft</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[color:var(--text-secondary)]">
                      {a.categoryId ? categoryNames.get(a.categoryId) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">{a.viewCount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      {votes > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="size-3" />
                          {Math.round((a.helpfulCount / votes) * 100)}% ({votes})
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-[color:var(--text-secondary)]">
                      {formatDistanceToNow(a.updatedAt, { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
