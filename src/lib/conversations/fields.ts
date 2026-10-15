// Conversation field rules shared by the inbox and the REST API.

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof PRIORITIES)[number];

export function isPriority(value: unknown): value is ConversationPriority {
  return PRIORITIES.includes(value as ConversationPriority);
}

/** Lowercase, hyphenated, unique tags (max 12, 32 characters each). */
export function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, ""))
        .filter((tag) => tag.length > 0 && tag.length <= 32),
    ),
  ].slice(0, 12);
}
