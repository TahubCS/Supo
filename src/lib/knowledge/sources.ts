// Validation shared by the knowledge server actions and the REST API.
import { DEFAULT_MAX_PAGES, MAX_PAGES_LIMIT } from "@/lib/knowledge/ingest";

export type AddSourceInput = {
  type: "article" | "url" | "website" | "github";
  name: string;
  url?: string;
  content?: string;
  maxPages?: number;
};

export const MAX_NAME_LENGTH = 200;
export const MAX_ARTICLE_LENGTH = 200_000;

function validateHttpUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  return url.toString();
}

export function validateSourceInput(input: AddSourceInput) {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error("Name is required");

  if (input.type === "article") {
    const content = input.content?.trim() ?? "";
    if (!content) throw new Error("Content is required");
    if (content.length > MAX_ARTICLE_LENGTH) {
      throw new Error(`Articles are limited to ${MAX_ARTICLE_LENGTH.toLocaleString()} characters`);
    }
    return { name, url: null, content, settings: null };
  }

  const url = validateHttpUrl(input.url);
  if (input.type === "github" && !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url)) {
    throw new Error("Enter a GitHub repository URL like https://github.com/owner/repo");
  }
  const settings =
    input.type === "website"
      ? { maxPages: Math.max(1, Math.min(Math.round(input.maxPages ?? DEFAULT_MAX_PAGES), MAX_PAGES_LIMIT)) }
      : null;
  return { name, url, content: null, settings };
}
