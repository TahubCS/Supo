// Pure text helpers for the help center (safe to import from client code).

export const RESERVED_SLUGS = new Set(["api", "admin", "new", "search", "sitemap", "help", "static", "assets"]);
export const MAX_ARTICLE_BODY = 100_000;
export const MAX_TITLE = 160;
export const MAX_SUMMARY = 300;

/** URL slug from free text: lowercase ASCII words joined by hyphens. */
export function slugify(text: string, maxLength = 80): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug;
}

export function isValidSlug(slug: string, { min = 1, max = 80 } = {}): boolean {
  return slug.length >= min && slug.length <= max && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function isValidHelpCenterSlug(slug: string): boolean {
  return isValidSlug(slug, { min: 3, max: 60 }) && !RESERVED_SLUGS.has(slug);
}

/** Appends -2, -3, … until the slug is not taken. */
export function nextAvailableSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "article";
  if (!used.has(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${root.slice(0, 75)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root.slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Plain text from Markdown, for excerpts, meta descriptions and search snippets. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First `max` characters of plain text, cut on a word boundary. */
export function excerpt(text: string, max = 160): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  // Look one character past the limit so a word ending exactly there is kept.
  const lastSpace = plain.slice(0, max).lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? plain.slice(0, lastSpace) : plain.slice(0, max - 1);
  return `${cut.replace(/[\s,.;:]+$/, "")}…`;
}

/** Markdown document the knowledge base indexes for a published article. */
export function articleKnowledgeContent(article: { title: string; summary: string | null; bodyMd: string }): string {
  return [`# ${article.title}`, article.summary?.trim(), article.bodyMd.trim()].filter(Boolean).join("\n\n");
}
