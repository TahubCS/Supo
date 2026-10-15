import { describe, expect, it } from "vitest";

import { extractDocument, extractHtml } from "@/lib/knowledge/extract";

const PAGE = `<!doctype html><html><head><title>Billing FAQ | Acme</title>
<style>.x{color:red}</style><script>window.track()</script></head>
<body>
<header><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
<main>
  <h1>Billing FAQ</h1>
  <p>Refunds are available within <strong>30 days</strong> of purchase.&nbsp;Contact &amp; support.</p>
  <h2>Plans</h2>
  <ul><li>Starter: $10/month</li><li>Pro: $49/month</li></ul>
  <p>See <a href="/docs/limits#seats">limits</a>.</p>
</main>
<footer>© Acme Inc</footer>
</body></html>`;

describe("extractHtml", () => {
  it("keeps headings, paragraphs and lists and drops chrome", () => {
    const page = extractHtml(PAGE, "https://acme.com/help/billing");
    expect(page.title).toBe("Billing FAQ | Acme");
    expect(page.text).toContain("# Billing FAQ");
    expect(page.text).toContain("## Plans");
    expect(page.text).toContain("- Starter: $10/month");
    expect(page.text).toContain("Refunds are available within 30 days of purchase. Contact & support.");
    expect(page.text).not.toContain("window.track");
    expect(page.text).not.toContain("© Acme");
    expect(page.text).not.toContain("color:red");
    // paragraphs are separated so the chunker can split them
    expect(page.text.split("\n\n").length).toBeGreaterThan(3);
  });

  it("resolves relative links and strips fragments", () => {
    const page = extractHtml(PAGE, "https://acme.com/help/billing");
    expect(page.links).toContain("https://acme.com/pricing");
    expect(page.links).toContain("https://acme.com/docs/limits");
  });
});

describe("extractDocument", () => {
  it("passes plain text through with normalized whitespace", () => {
    const doc = extractDocument("Line one\r\n\r\n\r\n  Line two  ", "text/plain");
    expect(doc.text).toBe("Line one\n\nLine two");
  });
});
