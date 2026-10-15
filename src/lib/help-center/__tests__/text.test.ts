import { describe, expect, it } from "vitest";

import {
  articleKnowledgeContent,
  excerpt,
  isValidHelpCenterSlug,
  nextAvailableSlug,
  slugify,
  stripMarkdown,
} from "@/lib/help-center/text";

describe("slugify", () => {
  it("builds lowercase ASCII slugs", () => {
    expect(slugify("How do I reset my password?")).toBe("how-do-i-reset-my-password");
    expect(slugify("  Café & Crème Brûlée  ")).toBe("cafe-creme-brulee");
    expect(slugify("Don't panic")).toBe("dont-panic");
    expect(slugify("日本語")).toBe("");
    expect(slugify("a".repeat(100), 10)).toBe("aaaaaaaaaa");
    expect(slugify("hello world again", 11)).toBe("hello-world");
  });

  it("validates help center slugs", () => {
    expect(isValidHelpCenterSlug("acme")).toBe(true);
    expect(isValidHelpCenterSlug("acme-help")).toBe(true);
    expect(isValidHelpCenterSlug("ac")).toBe(false);
    expect(isValidHelpCenterSlug("Acme")).toBe(false);
    expect(isValidHelpCenterSlug("acme--help")).toBe(false);
    expect(isValidHelpCenterSlug("-acme")).toBe(false);
    expect(isValidHelpCenterSlug("api")).toBe(false);
  });

  it("finds the next free slug", () => {
    expect(nextAvailableSlug("reset", [])).toBe("reset");
    expect(nextAvailableSlug("reset", ["reset", "reset-2"])).toBe("reset-3");
    expect(nextAvailableSlug("", [])).toBe("article");
  });
});

describe("stripMarkdown and excerpt", () => {
  it("removes markdown syntax", () => {
    const md = "# Title\n\nSome **bold** and _italic_ with a [link](https://x.y) and `code`.\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n\n> quote";
    expect(stripMarkdown(md)).toBe("Title Some bold and italic with a link and code. one two quote");
  });

  it("drops table syntax and html", () => {
    expect(stripMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a b 1 2");
    expect(stripMarkdown("Hi <script>x</script> there")).toBe("Hi x there");
  });

  it("cuts on word boundaries", () => {
    expect(excerpt("short text", 50)).toBe("short text");
    expect(excerpt("The quick brown fox jumps over the lazy dog", 20)).toBe("The quick brown fox…");
  });

  it("builds the knowledge document", () => {
    expect(articleKnowledgeContent({ title: "Reset", summary: " How to reset ", bodyMd: "Steps\n" })).toBe(
      "# Reset\n\nHow to reset\n\nSteps",
    );
    expect(articleKnowledgeContent({ title: "Reset", summary: null, bodyMd: "Steps" })).toBe("# Reset\n\nSteps");
  });
});
