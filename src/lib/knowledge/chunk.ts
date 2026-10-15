// Heading-aware recursive text splitter.
//
// Splits markdown-like text into sections by heading, then packs paragraphs
// into chunks of at most `maxChars`. Oversized paragraphs are split by
// sentence, and oversized sentences are hard-wrapped on whitespace. Chunks
// inside the same section overlap by up to `overlapChars` of whole sentences.

export type TextChunk = {
  content: string;
  headingPath: string[];
  index: number;
};

export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
  minChars?: number;
};

type Section = { headingPath: string[]; body: string };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; title: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ headingPath: stack.map((h) => h.title), body });
    buffer = [];
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.trim().match(HEADING_RE);
    if (match) {
      flush();
      const level = match[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title: match[2].trim() });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+(?=[^\s])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hardWrap(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Breaks a block into pieces that each fit within maxChars.
function atomize(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const pieces: string[] = [];
  for (const sentence of splitSentences(block)) {
    if (sentence.length <= maxChars) pieces.push(sentence);
    else pieces.push(...hardWrap(sentence, maxChars));
  }
  return pieces;
}

function overlapTail(content: string, overlapChars: number): string {
  if (overlapChars <= 0) return "";
  const sentences = splitSentences(content);
  const tail: string[] = [];
  let length = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = sentences[i];
    if (length + next.length + 1 > overlapChars) break;
    tail.unshift(next);
    length += next.length + 1;
  }
  return tail.join(" ");
}

export function chunkDocument(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? 1200;
  const overlapChars = Math.min(options.overlapChars ?? 150, Math.floor(maxChars / 4));
  const minChars = options.minChars ?? 25;

  const chunks: TextChunk[] = [];

  for (const section of splitSections(text)) {
    const blocks = section.body
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .flatMap((b) => atomize(b, maxChars));

    let current = "";
    let sectionChunks = 0;

    const push = () => {
      const content = current.trim();
      if (content.length >= minChars || (content && sectionChunks === 0 && blocks.length === 1)) {
        chunks.push({ content, headingPath: section.headingPath, index: chunks.length });
        sectionChunks++;
      }
    };

    for (const block of blocks) {
      const separator = current ? "\n\n" : "";
      if (current && current.length + separator.length + block.length > maxChars) {
        push();
        const tail = overlapTail(current, overlapChars);
        current = tail && tail.length + 2 + block.length <= maxChars ? `${tail}\n\n${block}` : block;
      } else {
        current = `${current}${separator}${block}`;
      }
    }
    if (current) push();
  }

  return chunks.filter((c) => c.content.length > 0);
}

/**
 * Text that is actually embedded: the document title and heading path give
 * each chunk context ("Billing > Refunds") that its body alone may not carry.
 */
export function buildEmbeddingText(chunk: Pick<TextChunk, "content" | "headingPath">, title?: string | null): string {
  const path = [title, ...chunk.headingPath].filter((part): part is string => Boolean(part && part.trim()));
  const deduped = path.filter((part, i) => i === 0 || part !== path[i - 1]);
  return deduped.length > 0 ? `${deduped.join(" > ")}\n\n${chunk.content}` : chunk.content;
}
