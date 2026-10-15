// Pure ranking helpers for hybrid retrieval (vector + keyword).

export type RankedCandidate = {
  id: string;
  vectorRank: number | null;
  keywordRank: number | null;
  similarity: number | null;
};

const RRF_K = 60;

/** Reciprocal Rank Fusion: robust way to merge rankings with different score scales. */
export function reciprocalRankFusion(candidate: RankedCandidate): number {
  let score = 0;
  if (candidate.vectorRank !== null) score += 1 / (RRF_K + candidate.vectorRank);
  if (candidate.keywordRank !== null) score += 1 / (RRF_K + candidate.keywordRank);
  return score;
}

export function mergeRankings(
  vector: { id: string; similarity: number }[],
  keyword: { id: string }[],
): RankedCandidate[] {
  const byId = new Map<string, RankedCandidate>();
  vector.forEach((row, index) => {
    byId.set(row.id, { id: row.id, vectorRank: index + 1, keywordRank: null, similarity: row.similarity });
  });
  keyword.forEach((row, index) => {
    const existing = byId.get(row.id);
    if (existing) existing.keywordRank = index + 1;
    else byId.set(row.id, { id: row.id, vectorRank: null, keywordRank: index + 1, similarity: null });
  });
  return [...byId.values()].sort((a, b) => reciprocalRankFusion(b) - reciprocalRankFusion(a));
}

/**
 * Decides whether a merged candidate is relevant enough to show the model.
 * Vector-only hits need a strong similarity; hits confirmed by keyword search
 * may have a weaker similarity (exact product names, error codes, SKUs).
 */
export function isRelevant(
  candidate: RankedCandidate,
  thresholds = { vector: 0.5, confirmed: 0.35 },
): boolean {
  const strongKeywordHit = candidate.keywordRank !== null && candidate.keywordRank <= 2;
  if (candidate.similarity === null) return strongKeywordHit;
  if (candidate.keywordRank !== null) return strongKeywordHit || candidate.similarity >= thresholds.confirmed;
  return candidate.similarity >= thresholds.vector;
}

const SMALL_TALK = new Set([
  "hi",
  "hii",
  "hey",
  "hello",
  "yo",
  "hiya",
  "howdy",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "ok",
  "okay",
  "k",
  "cool",
  "great",
  "awesome",
  "nice",
  "bye",
  "goodbye",
  "good morning",
  "good afternoon",
  "good evening",
  "yes",
  "no",
  "yep",
  "nope",
  "sure",
  "lol",
  "hmm",
  "test",
]);

/** Greetings / acknowledgements that should never count as a knowledge gap. */
export function isSmallTalk(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return true;
  if (SMALL_TALK.has(normalized)) return true;
  const words = normalized.split(" ");
  return words.length <= 3 && words.every((word) => SMALL_TALK.has(word) || /^(there|team|you|so|much|all|guys)$/.test(word));
}

/**
 * Builds the retrieval query. Short follow-ups ("what about Pro?") get the
 * previous customer turn as context so retrieval keeps the topic.
 */
export function buildRetrievalQuery(message: string, previousCustomerMessages: string[] = []): string {
  const trimmed = message.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const previous = previousCustomerMessages.filter((m) => m.trim() && !isSmallTalk(m)).at(-1);
  if (words.length < 6 && previous) return `${previous.trim()}\n${trimmed}`;
  return trimmed;
}
