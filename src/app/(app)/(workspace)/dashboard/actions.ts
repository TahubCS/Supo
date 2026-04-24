"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { member, product } from "@/db/schema";
import { auth } from "@/lib/auth";

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

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) throw new Error("No workspace found");

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

  return { id };
}
