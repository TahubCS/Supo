import type { ConfluenceSourceSettings } from "@/db/schema";
import { listSpacePages } from "@/lib/atlassian/confluence";
import { AtlassianApiError } from "@/lib/atlassian/oauth";
import { escapeHtml } from "@/lib/html";

import { extractHtml } from "./extract";

// Loads the current pages of one Confluence space. Page bodies come in
// Confluence's storage format (XHTML plus `ac:`/`ri:` elements); they are
// rewritten into plain HTML so the shared extractor can turn them into text.

export type ConfluenceDocument = { title: string; url: null; text: string; version: string };

export type ConfluenceLoadResult = {
  docs: ConfluenceDocument[];
  failedPages: number;
  totalPages: number;
  warnings: string[];
};

export const CONFLUENCE_MAX_PAGES = 400;

// Metadata, template hints and the duplicate fallback copy of editor nodes:
// none of it is page text.
const DROPPED_ELEMENTS = [
  "ac:placeholder",
  "ac:task-id",
  "ac:task-uuid",
  "ac:task-status",
  "ac:adf-attribute",
  "ac:adf-fallback",
].join("|");

/** Rewrites a storage-format body into HTML that `extractHtml` understands. */
function storageToHtml(storage: string): string {
  return (
    storage
      // CDATA (link text, code) is literal text. Escaping it first keeps it text
      // for the parser and out of reach of the rewrites below.
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, text: string) => escapeHtml(text))
      // Code blocks keep their text as preformatted text, without the macro's
      // language/theme parameters.
      .replace(
        /<ac:structured-macro(?=[\s>])[^>]*\bac:name="(?:code|noformat)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
        (_, inner: string) => `<pre>${/<ac:plain-text-body>([\s\S]*?)<\/ac:plain-text-body>/.exec(inner)?.[1] ?? ""}</pre>`,
      )
      .replace(new RegExp(`<(${DROPPED_ELEMENTS})(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</\\1>)`, "g"), "")
      // A macro's title (expand, panel) reads as a lead-in; other parameters
      // are configuration.
      .replace(/<ac:parameter(?=[\s/>])[^>]*\bac:name="title"[^>]*>([\s\S]*?)<\/ac:parameter>/g, "<p>$1</p>")
      .replace(/<ac:parameter(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/ac:parameter>)/g, "")
      // A link without its own text shows the linked page's title.
      .replace(
        /<ac:link(?=[\s>])[^>]*>\s*<ri:(?:page|blog-post)\b[^>]*\bri:content-title="([^"]*)"[^>]*\/>\s*<\/ac:link>/g,
        "$1",
      )
      .replace(/<(\/?)ac:task-list(?=[\s>])[^>]*>/g, "<$1ul>")
      .replace(/<(\/?)ac:task(?=[\s>])[^>]*>/g, "<$1li>")
  );
}

export function confluenceStorageToText(storage: string): string {
  return extractHtml(storageToHtml(storage)).text;
}

export async function loadConfluenceDocuments(
  connectionId: string,
  settings: ConfluenceSourceSettings,
): Promise<ConfluenceLoadResult> {
  let listed: Awaited<ReturnType<typeof listSpacePages>>;
  try {
    listed = await listSpacePages(connectionId, settings.cloudId, settings.spaceId, CONFLUENCE_MAX_PAGES);
  } catch (error) {
    if (error instanceof AtlassianApiError && (error.status === 403 || error.status === 404)) {
      throw new Error(
        `The Confluence space "${settings.spaceName}" could not be read. It may have been deleted, or the person who connected Confluence lost access to it.`,
      );
    }
    throw error;
  }

  const docs: ConfluenceDocument[] = [];
  for (const page of listed.pages) {
    const text = confluenceStorageToText(page.storage);
    if (!text) continue;
    // Citations are shown to customers, who can't open pages behind an Atlassian login.
    docs.push({ title: page.title, url: null, text, version: `confluence:${page.id}:${page.version}` });
  }

  const warnings = listed.truncated
    ? [`the space has more than ${CONFLUENCE_MAX_PAGES} pages, so only the ${CONFLUENCE_MAX_PAGES} most recently edited were indexed`]
    : [];
  return { docs, failedPages: 0, totalPages: listed.pages.length, warnings };
}
