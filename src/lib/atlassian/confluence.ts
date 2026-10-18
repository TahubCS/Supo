import { atlassianGet } from "./connection";
import { ACCESSIBLE_RESOURCES_PATH, confluenceSites, type AccessibleResource, type AtlassianSite } from "./oauth";

// Confluence Cloud REST API v2, reached through the api.atlassian.com gateway
// for one site (cloudId) of a workspace's Atlassian connection.

export type ConfluenceSpace = { id: string; key: string; name: string };

export type ConfluencePage = { id: string; title: string; version: number; storage: string };

export const MAX_LISTED_SPACES = 1000;
const SPACES_PER_REQUEST = 250;
// Requests carry page bodies; keep each response a reasonable size.
const PAGES_PER_REQUEST = 100;

// `_links.next` is a relative URL; only its cursor parameter is used.
const RELATIVE_BASE = "https://confluence.invalid";

type Paged<T> = { results: T[]; _links?: { next?: string } };

type RawPage = {
  id: string;
  title: string;
  version?: { number?: number };
  body?: { storage?: { value?: string } };
};

function apiPath(cloudId: string, path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `/ex/confluence/${encodeURIComponent(cloudId)}/wiki/api/v2${path}${query ? `?${query}` : ""}`;
}

/** Pages through a v2 list endpoint, following the cursor in `_links.next`. */
async function* listAll<T>(
  connectionId: string,
  cloudId: string,
  path: string,
  params: Record<string, string>,
): AsyncGenerator<T[]> {
  let cursor: string | null = null;
  do {
    const page: Paged<T> = await atlassianGet<Paged<T>>(
      connectionId,
      apiPath(cloudId, path, cursor ? { ...params, cursor } : params),
    );
    yield page.results;
    const next = page._links?.next;
    cursor = next ? new URL(next, RELATIVE_BASE).searchParams.get("cursor") : null;
  } while (cursor);
}

/** Sites the connection can read Confluence pages on. */
export async function listConfluenceSites(connectionId: string): Promise<AtlassianSite[]> {
  return confluenceSites(await atlassianGet<AccessibleResource[]>(connectionId, ACCESSIBLE_RESOURCES_PATH));
}

/** Current spaces on the site, by name. */
export async function listConfluenceSpaces(connectionId: string, cloudId: string): Promise<ConfluenceSpace[]> {
  const spaces: ConfluenceSpace[] = [];
  for await (const batch of listAll<ConfluenceSpace>(connectionId, cloudId, "/spaces", {
    status: "current",
    sort: "name",
    limit: String(SPACES_PER_REQUEST),
  })) {
    spaces.push(...batch.map(({ id, key, name }) => ({ id, key, name })));
    if (spaces.length >= MAX_LISTED_SPACES) return spaces.slice(0, MAX_LISTED_SPACES);
  }
  return spaces;
}

export async function getConfluenceSpace(
  connectionId: string,
  cloudId: string,
  spaceId: string,
): Promise<ConfluenceSpace> {
  const { id, key, name } = await atlassianGet<ConfluenceSpace>(
    connectionId,
    apiPath(cloudId, `/spaces/${encodeURIComponent(spaceId)}`),
  );
  return { id, key, name };
}

/**
 * Current pages of a space with their storage-format bodies, most recently
 * modified first, up to `maxPages`. `truncated` is set when the space has more.
 */
export async function listSpacePages(
  connectionId: string,
  cloudId: string,
  spaceId: string,
  maxPages: number,
): Promise<{ pages: ConfluencePage[]; truncated: boolean }> {
  const pages: ConfluencePage[] = [];
  const batches = listAll<RawPage>(connectionId, cloudId, `/spaces/${encodeURIComponent(spaceId)}/pages`, {
    status: "current",
    "body-format": "storage",
    sort: "-modified-date",
    limit: String(PAGES_PER_REQUEST),
  });
  for await (const batch of batches) {
    for (const raw of batch) {
      if (pages.length === maxPages) return { pages, truncated: true };
      pages.push({
        id: raw.id,
        title: raw.title,
        version: raw.version?.number ?? 0,
        storage: raw.body?.storage?.value ?? "",
      });
    }
  }
  return { pages, truncated: false };
}
