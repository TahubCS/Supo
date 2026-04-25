import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSuggestion } from "@/db/schema";

const GAP_DEDUPE_DAYS = 7;

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function createMissingKnowledgeSuggestion({
  productId,
  question,
  sourceConversationId,
  reason = "Knowledge retrieval found no useful matching content for this question.",
}: {
  productId: string;
  question: string;
  sourceConversationId?: string;
  reason?: string;
}): Promise<"created" | "existing" | "skipped"> {
  const normalized = normalizeQuestion(question);
  if (!productId || !normalized) return "skipped";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GAP_DEDUPE_DAYS);

  const recentGaps = await db.query.knowledgeSuggestion.findMany({
    where: and(
      eq(knowledgeSuggestion.productId, productId),
      eq(knowledgeSuggestion.kind, "gap"),
      eq(knowledgeSuggestion.status, "pending"),
      gte(knowledgeSuggestion.createdAt, cutoff),
    ),
    columns: { question: true },
  });

  if (recentGaps.some((gap) => normalizeQuestion(gap.question) === normalized)) {
    return "existing";
  }

  const now = new Date();
  await db.insert(knowledgeSuggestion).values({
    id: crypto.randomUUID(),
    productId,
    sourceConversationId: sourceConversationId ?? null,
    approvedSourceId: null,
    status: "pending",
    kind: "gap",
    confidence: 0,
    question: question.trim(),
    answer: null,
    content: null,
    reason,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return "created";
}
