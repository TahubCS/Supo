import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSuggestion } from "@/db/schema";

import { isSmallTalk } from "./rank";

const GAP_DEDUPE_DAYS = 30;
const SIMILAR_QUESTION_THRESHOLD = 0.6;

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "do", "does", "did", "i", "my", "me", "you", "your",
  "we", "our", "to", "of", "in", "on", "for", "and", "or", "it", "can", "how", "what", "why",
  "when", "where", "which", "with", "be", "there", "this", "that", "please", "hi", "hello", "hey",
]);

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function questionTerms(question: string): Set<string> {
  return new Set(
    normalizeQuestion(question)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((word) => word.replace(/(ing|ed|es|s)$/, ""))
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

/** Jaccard similarity of meaningful terms; 1 = same question. */
export function questionSimilarity(a: string, b: string): number {
  const left = questionTerms(a);
  const right = questionTerms(b);
  if (left.size === 0 || right.size === 0) return normalizeQuestion(a) === normalizeQuestion(b) ? 1 : 0;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared++;
  return shared / (left.size + right.size - shared);
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
  if (!productId || !normalized || isSmallTalk(question)) return "skipped";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GAP_DEDUPE_DAYS);

  const recentGaps = await db.query.knowledgeSuggestion.findMany({
    where: and(
      eq(knowledgeSuggestion.productId, productId),
      eq(knowledgeSuggestion.kind, "gap"),
      eq(knowledgeSuggestion.status, "pending"),
      gte(knowledgeSuggestion.createdAt, cutoff),
    ),
    columns: { id: true, question: true },
  });

  const duplicate = recentGaps.find(
    (gap) => questionSimilarity(gap.question, question) >= SIMILAR_QUESTION_THRESHOLD,
  );
  if (duplicate) {
    await db
      .update(knowledgeSuggestion)
      .set({ hits: sql`${knowledgeSuggestion.hits} + 1`, updatedAt: new Date() })
      .where(eq(knowledgeSuggestion.id, duplicate.id));
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
    hits: 1,
    question: question.trim().slice(0, 500),
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
