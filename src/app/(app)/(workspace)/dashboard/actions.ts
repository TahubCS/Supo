"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { knowledgeSource, member, product, productMember } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { isWorkspaceOwnerRole } from "@/lib/product-access";

export interface CreateProductValues {
  name: string;
  category: string;
  description: string;
  url: string;
}

export async function createProduct(
  values: CreateProductValues,
): Promise<{ id: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const memberships = await db.query.member.findMany({
    where: eq(member.userId, session.user.id),
  });
  const membership = memberships.find(
    (item) => isWorkspaceOwnerRole(item.role) || item.role === "admin",
  );
  if (!membership) throw new Error("Only workspace admins can create products");

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(product).values({
    id,
    organizationId: membership.organizationId,
    name: values.name,
    category: values.category || "other",
    description: values.description || null,
    url: values.url || null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(productMember).values({
    id: crypto.randomUUID(),
    productId: id,
    userId: session.user.id,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  // Auto-bootstrap: if a URL is provided, create a sitemap source and kick off crawl immediately
  if (values.url?.trim()) {
    const sourceId = crypto.randomUUID();
    await db.insert(knowledgeSource).values({
      id: sourceId,
      productId: id,
      type: "sitemap",
      name: "Website (auto-discovered)",
      url: values.url.trim(),
      status: "indexing",
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    fetch(`${env.BETTER_AUTH_URL}/api/knowledge/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.BETTER_AUTH_API_KEY },
      body: JSON.stringify({ sourceId, productId: id }),
    }).catch(() => {});
  }

  return { id };
}
