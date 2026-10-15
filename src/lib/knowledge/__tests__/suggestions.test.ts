import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

const { questionSimilarity } = await import("@/lib/knowledge/suggestions");

describe("questionSimilarity", () => {
  it("matches rephrasings of the same question", () => {
    expect(questionSimilarity("How do I cancel my subscription?", "how can i cancel the subscription")).toBeGreaterThanOrEqual(0.6);
    expect(questionSimilarity("Do you offer refunds?", "refunds offered?")).toBeGreaterThanOrEqual(0.6);
  });

  it("keeps different questions apart", () => {
    expect(questionSimilarity("How do I cancel my subscription?", "How do I change my password?")).toBeLessThan(0.6);
  });
});
