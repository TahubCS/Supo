import { describe, expect, it } from "vitest";

import { buildEmbeddingText, chunkDocument, splitSentences } from "@/lib/knowledge/chunk";

describe("chunkDocument", () => {
  it("never produces a chunk larger than maxChars, even for one giant line", () => {
    const giant = "Refunds are processed in five business days. ".repeat(2000); // ~90k chars, no newlines
    const chunks = chunkDocument(giant, { maxChars: 1200 });
    expect(chunks.length).toBeGreaterThan(50);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(1200);
  });

  it("hard-wraps a single sentence with no punctuation", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkDocument(words, { maxChars: 500 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(500);
  });

  it("tracks the heading path for each section", () => {
    const text = [
      "# Billing",
      "Everything about invoices and payment methods for your account.",
      "## Refunds",
      "Refunds are available within 30 days of purchase for annual plans.",
      "# Security",
      "We support SSO with SAML and enforce two factor authentication.",
    ].join("\n\n");
    const chunks = chunkDocument(text);
    expect(chunks.map((c) => c.headingPath)).toEqual([["Billing"], ["Billing", "Refunds"], ["Security"]]);
  });

  it("packs small paragraphs together and overlaps consecutive chunks", () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, i) => `Paragraph ${i} explains one specific feature in detail. It has a second sentence ${i}.`,
    );
    const chunks = chunkDocument(paragraphs.join("\n\n"), { maxChars: 300, overlapChars: 120 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.length).toBeLessThan(paragraphs.length);
    // the start of chunk 2 repeats the end of chunk 1
    const lastSentence = splitSentences(chunks[0].content).at(-1)!;
    expect(chunks[1].content.startsWith(lastSentence)).toBe(true);
  });

  it("drops empty input", () => {
    expect(chunkDocument("   \n\n  ")).toEqual([]);
  });
});

describe("buildEmbeddingText", () => {
  it("prefixes title and heading path", () => {
    expect(buildEmbeddingText({ content: "Body", headingPath: ["Billing", "Refunds"] }, "Help Center")).toBe(
      "Help Center > Billing > Refunds\n\nBody",
    );
    expect(buildEmbeddingText({ content: "Body", headingPath: ["FAQ"] }, "FAQ")).toBe("FAQ\n\nBody");
    expect(buildEmbeddingText({ content: "Body", headingPath: [] })).toBe("Body");
  });
});
