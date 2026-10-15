import type { MetadataRoute } from "next";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { article, helpCenter } from "@/db/schema";
import { appUrl } from "@/lib/email";

// Reads the database, so it is generated per request instead of at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: appUrl("/"), changeFrequency: "weekly", priority: 1 }];
  try {
    const centers = await db
      .select({ productId: helpCenter.productId, slug: helpCenter.slug, updatedAt: helpCenter.updatedAt })
      .from(helpCenter)
      .where(eq(helpCenter.enabled, true));
    for (const center of centers) {
      entries.push({ url: appUrl(`/help/${center.slug}`), lastModified: center.updatedAt, changeFrequency: "daily", priority: 0.8 });
      const articles = await db
        .select({ slug: article.slug, updatedAt: article.updatedAt })
        .from(article)
        .where(and(eq(article.productId, center.productId), eq(article.status, "published")))
        .limit(5000);
      for (const item of articles) {
        entries.push({
          url: appUrl(`/help/${center.slug}/${item.slug}`),
          lastModified: item.updatedAt,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch (error) {
    console.error("[sitemap] could not list help center articles", error);
  }
  return entries;
}
