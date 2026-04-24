import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { knowledgeSource, member, product } from "@/db/schema";
import { auth } from "@/lib/auth";

import { KnowledgeBase } from "./KnowledgeBase";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) notFound();

  const foundProduct = await db.query.product.findFirst({
    where: eq(product.id, id),
  });
  if (!foundProduct || foundProduct.organizationId !== membership.organizationId) {
    notFound();
  }

  const sources = await db.query.knowledgeSource.findMany({
    where: eq(knowledgeSource.productId, id),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Knowledge</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Knowledge base</h1>
      <KnowledgeBase productId={id} sources={sources} />
    </div>
  );
}
