import { eq } from "drizzle-orm";

import { db } from "@/db";
import { conversationRating, widgetConfig } from "@/db/schema";

/** Customers can rate a resolved conversation for this long. */
export const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_RATING_COMMENT = 1000;

type RatableConversation = {
  id: string;
  productId: string;
  status: string;
  resolvedAt: Date | null;
};

export async function isCsatEnabled(productId: string): Promise<boolean> {
  const row = await db.query.widgetConfig.findFirst({
    where: eq(widgetConfig.productId, productId),
    columns: { csatEnabled: true },
  });
  return row?.csatEnabled ?? true;
}

export function isWithinRatingWindow(conv: RatableConversation, now = Date.now()): boolean {
  return conv.status === "resolved" && Boolean(conv.resolvedAt) && now - conv.resolvedAt!.getTime() <= RATING_WINDOW_MS;
}

/** True when the widget should ask the customer to rate this conversation. */
export async function shouldRequestRating(conv: RatableConversation): Promise<boolean> {
  if (!isWithinRatingWindow(conv)) return false;
  const [enabled, existing] = await Promise.all([
    isCsatEnabled(conv.productId),
    db.query.conversationRating.findFirst({
      where: eq(conversationRating.conversationId, conv.id),
      columns: { id: true },
    }),
  ]);
  return enabled && !existing;
}

export type RatingInput = { score: number; comment?: string | null };

export function parseRatingInput(input: { score?: unknown; comment?: unknown }): RatingInput | string {
  const score = typeof input.score === "number" ? input.score : Number.NaN;
  if (!Number.isInteger(score) || score < 1 || score > 5) return "score must be an integer from 1 to 5";
  if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") {
    return "comment must be a string";
  }
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, MAX_RATING_COMMENT) : "";
  return { score, comment: comment || null };
}

/**
 * Stores (or updates) the customer's rating. The resolving agent is credited
 * so per-agent CSAT stays correct even if the conversation is reassigned later.
 */
export async function submitRating(conv: RatableConversation & { resolvedById: string | null }, input: RatingInput) {
  const now = new Date();
  const [row] = await db
    .insert(conversationRating)
    .values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      productId: conv.productId,
      agentId: conv.resolvedById,
      score: input.score,
      comment: input.comment ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: conversationRating.conversationId,
      set: { score: input.score, comment: input.comment ?? null },
    })
    .returning();
  return row;
}

export async function getConversationRating(conversationId: string) {
  return db.query.conversationRating.findFirst({
    where: eq(conversationRating.conversationId, conversationId),
    columns: { score: true, comment: true, createdAt: true },
  });
}
