import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { knowledgeSource, knowledgeSuggestion } from "@/db/schema";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { KnowledgeBase } from "./KnowledgeBase";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "knowledge")) notFound();

  const sources = await db.query.knowledgeSource.findMany({
    where: eq(knowledgeSource.productId, id),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });

  const suggestions = await db.query.knowledgeSuggestion.findMany({
    where: and(
      eq(knowledgeSuggestion.productId, id),
      eq(knowledgeSuggestion.status, "pending"),
    ),
    with: {
      sourceConversation: {
        columns: {
          id: true,
          subject: true,
          status: true,
          lastMessageAt: true,
        },
        with: {
          customer: {
            columns: { id: true, name: true, email: true },
          },
        },
      },
    },
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });

  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Knowledge</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">Knowledge base</h1>
      <KnowledgeBase productId={id} sources={sources} suggestions={suggestions} />
    </div>
  );
}
