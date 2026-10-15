import { ChevronRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPublicHelpCenter,
  helpCenterUrl,
  listCategories,
  listPopularArticles,
  listPublishedArticles,
  searchArticles,
  type ArticleListItem,
} from "@/lib/help-center/service";

import { SearchBox } from "./SearchBox";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const center = await getPublicHelpCenter(slug);
  if (!center) return {};
  return {
    title: { absolute: center.title },
    description: center.description ?? `Answers and guides from ${center.productName}.`,
    alternates: { canonical: helpCenterUrl(center.slug) },
    openGraph: { title: center.title, description: center.description ?? undefined, type: "website" },
  };
}

function ArticleLink({ base, item }: { base: string; item: ArticleListItem }) {
  return (
    <Link href={`${base}/${item.slug}`} className="group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-[color:var(--card-elevated)]">
      <FileText className="mt-0.5 size-4 shrink-0 text-[color:var(--text-tertiary)]" />
      <span className="min-w-0">
        <span className="block font-medium text-foreground group-hover:underline">{item.title}</span>
        {item.summary && <span className="mt-0.5 line-clamp-2 block text-sm text-[color:var(--text-secondary)]">{item.summary}</span>}
      </span>
    </Link>
  );
}

export default async function HelpCenterHome({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q } = await searchParams;
  const center = await getPublicHelpCenter(slug);
  if (!center) notFound();
  const base = `/help/${center.slug}`;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  if (query) {
    const results = await searchArticles(center.productId, query, 25);
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <SearchBox action={base} defaultValue={query} />
        <p className="mt-8 mb-3 text-sm text-[color:var(--text-secondary)]">
          {results.length === 0 ? "No articles matched" : `${results.length} result${results.length === 1 ? "" : "s"}`} for “{query}”
        </p>
        <div className="space-y-1">
          {results.map((item) => (
            <ArticleLink key={item.id} base={base} item={item} />
          ))}
        </div>
        {results.length === 0 && (
          <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
            Try different words, or <Link href={base} className="underline">browse all articles</Link>.
          </p>
        )}
      </div>
    );
  }

  const [categories, articles, popular] = await Promise.all([
    listCategories(center.productId),
    listPublishedArticles(center.productId),
    listPopularArticles(center.productId, 6),
  ]);
  const byCategory = new Map<string | null, ArticleListItem[]>();
  for (const item of articles) {
    const key = categories.some((c) => c.id === item.categoryId) ? item.categoryId : null;
    byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
  }
  const sections = [
    ...categories.map((c) => ({ id: c.id, name: c.name, description: c.description, items: byCategory.get(c.id) ?? [] })),
    { id: "other", name: categories.length ? "More articles" : "All articles", description: null, items: byCategory.get(null) ?? [] },
  ].filter((section) => section.items.length > 0);

  return (
    <div>
      <section className="border-b border-border bg-[color:var(--card-elevated)]">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h1 className="text-3xl font-bold tracking-tight">How can we help?</h1>
          {center.description && <p className="mt-3 text-[color:var(--text-secondary)]">{center.description}</p>}
          <div className="mt-8">
            <SearchBox action={base} large />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {articles.length === 0 ? (
          <p className="py-16 text-center text-[color:var(--text-secondary)]">No articles have been published yet.</p>
        ) : (
          <>
            {popular.length > 2 && articles.length > 6 && (
              <section className="mb-10">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-[color:var(--text-secondary)] uppercase">Popular</h2>
                <div className="grid gap-1 sm:grid-cols-2">
                  {popular.map((item) => (
                    <ArticleLink key={item.id} base={base} item={item} />
                  ))}
                </div>
              </section>
            )}
            <div className="grid gap-8 md:grid-cols-2">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold">{section.name}</h2>
                  {section.description && <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{section.description}</p>}
                  <ul className="mt-3 space-y-1">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link href={`${base}/${item.slug}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[color:var(--card-elevated)]">
                          <span className="truncate">{item.title}</span>
                          <ChevronRight className="size-4 shrink-0 text-[color:var(--text-tertiary)]" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
