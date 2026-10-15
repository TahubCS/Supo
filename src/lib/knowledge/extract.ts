import { HTMLElement, Node, NodeType, parse } from "node-html-parser";

// Converts an HTML page into structured, markdown-like text that keeps
// headings, paragraphs and lists, so the chunker can split on real
// boundaries and citations can point to the right section.

export type ExtractedPage = {
  title: string | null;
  text: string;
  links: string[];
};

const DROP_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "form",
  "button",
  "select",
  "nav",
  "header",
  "footer",
  "aside",
];

const DROP_SELECTORS = [
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  "[hidden]",
  ".cookie-banner",
  "#cookie-banner",
  ".sr-only",
];

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "blockquote",
  "table",
  "tr",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "details",
  "summary",
  "ul",
  "ol",
  "body",
]);

function collapse(text: string): string {
  return text.replace(/[ \t\f\v ]+/g, " ");
}

function render(node: Node, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push(collapse(node.text));
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() ?? "";

  const heading = tag.match(/^h([1-6])$/);
  if (heading) {
    const text = collapse(el.text).trim();
    if (text) out.push(`\n\n${"#".repeat(Number(heading[1]))} ${text}\n\n`);
    return;
  }

  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "pre") {
    const code = el.text.replace(/\r\n/g, "\n").trim();
    if (code) out.push(`\n\n${code}\n\n`);
    return;
  }
  if (tag === "li") {
    const parts: string[] = [];
    for (const child of el.childNodes) render(child, parts);
    const text = parts.join("").replace(/\s*\n\s*/g, " ").trim();
    if (text) out.push(`\n- ${text}`);
    return;
  }
  if (tag === "td" || tag === "th") {
    const parts: string[] = [];
    for (const child of el.childNodes) render(child, parts);
    out.push(` ${parts.join("").replace(/\s+/g, " ").trim()} |`);
    return;
  }

  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock) out.push("\n\n");
  for (const child of el.childNodes) render(child, out);
  if (isBlock) out.push("\n\n");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickContentRoot(root: HTMLElement): HTMLElement {
  const candidates = [
    root.querySelector("main"),
    root.querySelector('[role="main"]'),
    root.querySelector("article"),
    root.querySelector("#content"),
    root.querySelector(".content"),
    root.querySelector("body"),
  ].filter((el): el is HTMLElement => Boolean(el));

  // Prefer the first candidate that holds a meaningful share of the page text.
  const bodyLength = (root.querySelector("body") ?? root).text.trim().length || 1;
  for (const candidate of candidates) {
    if (candidate.text.trim().length >= Math.min(200, bodyLength * 0.3)) return candidate;
  }
  return root.querySelector("body") ?? root;
}

export function extractLinks(root: HTMLElement, baseUrl?: string): string[] {
  const links = new Set<string>();
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href")?.trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      links.add(url.toString());
    } catch {
      // ignore malformed hrefs
    }
  }
  return [...links];
}

export function extractHtml(html: string, baseUrl?: string): ExtractedPage {
  const root = parse(html, { comment: false, blockTextElements: { pre: true } });

  const title =
    collapse(root.querySelector("meta[property='og:title']")?.getAttribute("content") ?? "").trim() ||
    collapse(root.querySelector("title")?.text ?? "").trim() ||
    collapse(root.querySelector("h1")?.text ?? "").trim() ||
    null;

  const links = extractLinks(root, baseUrl);

  for (const tag of DROP_TAGS) {
    for (const el of root.querySelectorAll(tag)) el.remove();
  }
  for (const selector of DROP_SELECTORS) {
    try {
      for (const el of root.querySelectorAll(selector)) el.remove();
    } catch {
      // selector unsupported by the parser; skip
    }
  }

  const out: string[] = [];
  render(pickContentRoot(root), out);

  return { title, text: normalizeText(out.join("")), links };
}

/** Best-effort conversion of any fetched document into indexable text. */
export function extractDocument(
  body: string,
  contentType: string,
  url?: string,
): ExtractedPage {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "text/html" || type === "application/xhtml+xml" || (!type && /<html[\s>]/i.test(body))) {
    return extractHtml(body, url);
  }
  return { title: null, text: normalizeText(body), links: [] };
}
