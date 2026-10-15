import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/Markdown";
import {
  getPublicHelpCenter,
  getPublishedArticle,
  helpCenterUrl,
  recordArticleView,
  searchArticles,
} from "@/lib/help-center/service";
import { excerpt, stripMarkdown } from "@/lib/help-center/text";

import { SearchBox } from "../SearchBox";
import { ArticleFeedback } from "./ArticleFeedback";

type Props = { params: Promise<{ slug: string; articleSlug: string }> };

async function load(slug: string, articleSlug: string) {
  const center = await getPublicHelpCenter(slug);
  if (!center) return null;
  const item = await getPublishedArticle(center.productId, articleSlug);
  return item ? { center, item } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, articleSlug } = await params;
  const loaded = await load(slug, articleSlug);
  if (!loaded) return {};
  const { center, item } = loaded;
  const description = item.summary?.trim() || excerpt(stripMarkdown(item.bodyMd), 160);
  return {
    title: { absolute: `${item.title} | ${center.title}` },
    description,
    alternates: { canonical: helpCenterUrl(center.slug, item.slug) },
    openGraph: { title: item.title, description, type: "article", modifiedTime: item.updatedAt.toISOString() },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug, articleSlug } = await params;
  const loaded = await load(slug, articleSlug);
  if (!loaded) notFound();
  const { center, item } = loaded;
  const base = `/help/${center.slug}`;

  // Best effort; a failed counter must not break the page.
  await recordArticleView(item.id).catch(() => {});
  const related = (await searchArticles(center.productId, item.title, 6).catch(() => []))
    .filter((r) => r.id !== item.id)
    .slice(0, 4);

  // Structured data for search engines. "<" is escaped so content can't close the script tag.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.summary ?? undefined,
    dateModified: item.updatedAt.toISOString(),
    datePublished: item.publishedAt?.toISOString(),
    publisher: { "@type": "Organization", name: center.productName },
    mainEntityOfPage: helpCenterUrl(center.slug, item.slug),
  }).replace(/</g, "\\u003c");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-[color:var(--text-secondary)]">
          <Link href={base} className="hover:text-foreground">
            {center.title}
          </Link>
          {item.category && (
            <>
              <ChevronRight className="size-3.5 shrink-0" />
              <Link href={`${base}#${item.category.id}`} className="truncate hover:text-foreground">
                {item.category.name}
              </Link>
            </>
          )}
        </nav>
        <div className="sm:w-72">
          <SearchBox action={base} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
        <article className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{item.title}</h1>
          <p className="mt-2 text-sm text-[color:var(--text-tertiary)]">
            Updated {item.updatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          {item.summary && <p className="mt-4 text-lg text-[color:var(--text-secondary)]">{item.summary}</p>}
          <Markdown className="mt-6 text-[15px]">{item.bodyMd}</Markdown>
          <ArticleFeedback articleId={item.id} />
        </article>

        {related.length > 0 && (
          <aside>
            <h2 className="mb-3 text-sm font-semibold">Related articles</h2>
            <ul className="space-y-2 text-sm">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/${r.slug}`} className="text-[color:var(--text-secondary)] hover:text-foreground hover:underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
