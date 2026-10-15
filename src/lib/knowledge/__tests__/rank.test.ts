import { describe, expect, it } from "vitest";

import {
  buildRetrievalQuery,
  isRelevant,
  isSmallTalk,
  mergeRankings,
} from "@/lib/knowledge/rank";

describe("mergeRankings", () => {
  it("boosts results found by both vector and keyword search", () => {
    const merged = mergeRankings(
      [
        { id: "a", similarity: 0.71 },
        { id: "b", similarity: 0.66 },
        { id: "c", similarity: 0.6 },
      ],
      [{ id: "c" }, { id: "d" }],
    );
    expect(merged[0].id).toBe("c");
    expect(merged.find((m) => m.id === "d")).toMatchObject({ vectorRank: null, keywordRank: 2 });
  });
});

describe("isRelevant", () => {
  it("requires strong similarity for vector-only matches", () => {
    expect(isRelevant({ id: "x", vectorRank: 1, keywordRank: null, similarity: 0.45 })).toBe(false);
    expect(isRelevant({ id: "x", vectorRank: 1, keywordRank: null, similarity: 0.62 })).toBe(true);
  });

  it("accepts weaker similarity when confirmed by keywords", () => {
    expect(isRelevant({ id: "x", vectorRank: 4, keywordRank: 1, similarity: 0.4 })).toBe(true);
    expect(isRelevant({ id: "x", vectorRank: null, keywordRank: 2, similarity: null })).toBe(true);
    expect(isRelevant({ id: "x", vectorRank: null, keywordRank: 7, similarity: null })).toBe(false);
    // exact-term hits (error codes, product names) rank first in keyword search
    expect(isRelevant({ id: "x", vectorRank: 9, keywordRank: 1, similarity: 0.2 })).toBe(true);
    expect(isRelevant({ id: "x", vectorRank: 9, keywordRank: 5, similarity: 0.2 })).toBe(false);
  });
});

describe("isSmallTalk", () => {
  it.each(["hi", "Hello!", "thanks so much", "ok", "hey there", "  "])("treats %j as small talk", (msg) => {
    expect(isSmallTalk(msg)).toBe(true);
  });

  it.each(["how do I reset my password?", "refund", "hi, my invoice is wrong"])("treats %j as a question", (msg) => {
    expect(isSmallTalk(msg)).toBe(false);
  });
});

describe("buildRetrievalQuery", () => {
  it("adds the previous customer question to short follow-ups", () => {
    expect(buildRetrievalQuery("what about Pro?", ["How much does the Starter plan cost?"])).toBe(
      "How much does the Starter plan cost?\nwhat about Pro?",
    );
  });

  it("leaves standalone questions alone and ignores small-talk history", () => {
    expect(buildRetrievalQuery("How do I export all of my invoices as CSV?", ["hi"])).toBe(
      "How do I export all of my invoices as CSV?",
    );
    expect(buildRetrievalQuery("pricing?", ["thanks"])).toBe("pricing?");
  });
});
