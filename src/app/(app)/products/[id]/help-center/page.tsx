import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { article, articleCategory } from "@/db/schema";
import { getHelpCenterForProduct, helpCenterUrl } from "@/lib/help-center/service";
import { slugify } from "@/lib/help-center/text";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { HelpCenterAdmin } from "./HelpCenterAdmin";

export default async function HelpCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "helpCenter")) notFound();

  const [center, categories, articles] = await Promise.all([
    getHelpCenterForProduct(id),
    db.select().from(articleCategory).where(eq(articleCategory.productId, id)).orderBy(asc(articleCategory.position), asc(articleCategory.name)),
    db
      .select({
        id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        categoryId: article.categoryId,
        viewCount: article.viewCount,
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount,
        updatedAt: article.updatedAt,
      })
      .from(article)
      .where(eq(article.productId, id))
      .orderBy(desc(article.updatedAt))
      .limit(1000),
  ]);

  const settings = center ?? {
    enabled: false,
    slug: slugify(access.product.name).slice(0, 60).padEnd(3, "x"),
    title: `${access.product.name} Help Center`,
    description: null,
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Self-service</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Help center</h1>
      <HelpCenterAdmin
        productId={id}
        settings={{
          enabled: settings.enabled,
          slug: settings.slug,
          title: settings.title,
          description: settings.description ?? "",
        }}
        publicUrl={center?.enabled ? helpCenterUrl(center.slug) : null}
        categories={categories.map((c) => ({ id: c.id, name: c.name, description: c.description ?? "" }))}
        articles={articles}
      />
    </div>
  );
}
