import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES, parseUploadedFile, UploadError } from "@/lib/knowledge/parse-file";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "fixtures", name)));
const text = (value: string) => new TextEncoder().encode(value);

describe("parseUploadedFile", () => {
  it("extracts text from a PDF", async () => {
    const parsed = await parseUploadedFile("refund-policy.pdf", fixture("refund-policy.pdf"));
    expect(parsed).toMatchObject({ title: "refund policy", format: "pdf" });
    expect(parsed.text).toContain("Refund policy: refunds within 30 days.");
  });

  it("extracts headings and paragraphs from a Word document", async () => {
    const parsed = await parseUploadedFile("shipping-guide.docx", fixture("shipping-guide.docx"));
    expect(parsed.format).toBe("docx");
    expect(parsed.text).toMatch(/#\s*Shipping guide/);
    expect(parsed.text).toContain("Orders ship within two business days.");
  });

  it("reads text formats and HTML", async () => {
    expect((await parseUploadedFile("faq.md", text("﻿# FAQ\n\n\n\nHello"))).text).toBe("# FAQ\n\nHello");
    expect((await parseUploadedFile("prices.csv", text("plan,price\npro,10"))).format).toBe("csv");
    const html = await parseUploadedFile("page.html", text("<html><head><title>Billing</title></head><body><nav>menu</nav><main><h2>Invoices</h2><p>Monthly.</p></main></body></html>"));
    expect(html.title).toBe("Billing");
    expect(html.text).toContain("Invoices");
    expect(html.text).not.toContain("menu");
  });

  it("rejects unsupported, empty, oversized and mislabeled files", async () => {
    await expect(parseUploadedFile("tool.exe", text("MZ"))).rejects.toBeInstanceOf(UploadError);
    await expect(parseUploadedFile("empty.txt", new Uint8Array())).rejects.toThrow("empty");
    await expect(parseUploadedFile("blank.txt", text("   \n  "))).rejects.toThrow("No readable text");
    await expect(parseUploadedFile("big.txt", new Uint8Array(MAX_UPLOAD_BYTES + 1))).rejects.toThrow("limited");
    await expect(parseUploadedFile("fake.pdf", text("hello"))).rejects.toThrow("PDF");
    await expect(parseUploadedFile("fake.docx", text("hello"))).rejects.toThrow("docx");
  });
});
