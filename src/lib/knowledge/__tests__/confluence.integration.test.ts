// Integration test: requires a Postgres database with pgvector and all
// migrations applied. Runs only when TEST_DATABASE_URL is set.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeEmbedding } from "@/test/fake-embeddings";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
process.env.INTEGRATIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.ATLASSIAN_CLIENT_ID ??= "test-client";
process.env.ATLASSIAN_CLIENT_SECRET ??= "test-secret";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const embedded: string[] = [];
vi.mock("@/lib/knowledge/ai", () => ({
  geminiEmbedQuery: async (text: string) => ({ embedding: fakeEmbedding(text), model: "fake-embed" }),
  geminiEmbedManyWithModel: async (texts: string[]) => {
    embedded.push(...texts);
    return { embeddings: texts.map(fakeEmbedding), model: "fake-embed" };
  },
  geminiGenerate: async () => "stub",
}));

const CLOUD_ID = "cloud-1";
const SPACE_ID = "98304";
// The fake site returns two results per request, so loading always paginates.
const BATCH = 2;

type FakePage = { id: string; title: string; version: number; storage: string };

// Stands in for the Confluence v2 API behind api.atlassian.com.
const site = {
  pages: [] as FakePage[],
  spaces: [] as { id: string; key: string; name: string; type: string }[],
  requests: [] as URL[],
};

function paged<T>(items: T[], url: URL): Response {
  const start = Number(url.searchParams.get("cursor") ?? 0);
  const next = start + BATCH < items.length ? `${url.pathname.replace(/^\/ex\/confluence\/[^/]+/, "")}?cursor=${start + BATCH}` : undefined;
  return Response.json({ results: items.slice(start, start + BATCH), _links: { next, base: "https://acme.atlassian.net/wiki" } });
}

function fakeConfluence(input: string, init: RequestInit): Response {
  const url = new URL(input);
  site.requests.push(url);
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-1");
  const base = `/ex/confluence/${CLOUD_ID}/wiki/api/v2`;
  if (url.pathname === `${base}/spaces`) return paged(site.spaces, url);
  if (url.pathname === `${base}/spaces/${SPACE_ID}/pages`) {
    return paged(
      site.pages.map((page) => ({
        id: page.id,
        status: "current",
        title: page.title,
        spaceId: SPACE_ID,
        version: { number: page.version },
        body: { storage: { value: page.storage, representation: "storage" } },
      })),
      url,
    );
  }
  return Response.json({ errors: [{ status: 404, code: "NOT_FOUND", title: "Not Found" }] }, { status: 404 });
}

const initialPages = (): FakePage[] => [
  {
    id: "1001",
    title: "Refund policy",
    version: 4,
    storage:
      "<h1>Refunds</h1><p>Annual plans can be refunded within thirty days of purchase. Contact billing support to request one.</p>",
  },
  {
    id: "1002",
    title: "Single sign-on",
    version: 2,
    storage: "<p>Enterprise workspaces can enforce SAML single sign-on for every member.</p>",
  },
  // A page that only lists its children has no text of its own.
  {
    id: "1003",
    title: "Guides",
    version: 1,
    storage: '<ac:structured-macro ac:name="children"><ac:parameter ac:name="all">true</ac:parameter></ac:structured-macro>',
  },
  {
    id: "1004",
    title: "Installing the desktop app",
    version: 7,
    storage: "<p>Download the installer from the account page and run it.</p>",
  },
];

describe.skipIf(!DATABASE_URL)("Confluence knowledge source (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const userId = `user_${crypto.randomUUID()}`;
  let connectionId: string;
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    jobs: typeof import("@/lib/jobs");
    retrieve: typeof import("@/lib/knowledge/retrieve");
    ingest: typeof import("@/lib/knowledge/ingest");
    confluence: typeof import("@/lib/atlassian/confluence");
    connection: typeof import("@/lib/atlassian/connection");
  };

  async function addSpaceSource(spaceId = SPACE_ID) {
    const id = crypto.randomUUID();
    const now = new Date();
    await mod.db.insert(mod.schema.knowledgeSource).values({
      id,
      productId,
      type: "confluence",
      name: "Help space",
      atlassianConnectionId: connectionId,
      settings: {
        confluence: {
          cloudId: CLOUD_ID,
          siteUrl: "https://acme.atlassian.net",
          siteName: "Acme",
          spaceId,
          spaceKey: "HELP",
          spaceName: "Help",
        },
      },
      status: "indexing",
      indexingStartedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId: id }, { dedupeKey: `knowledge.ingest:${id}`, maxAttempts: 1 });
    await mod.jobs.runJobNow(jobId);
    return id;
  }

  async function sourceRow(id: string) {
    const { eq } = await import("drizzle-orm");
    return mod.db.query.knowledgeSource.findFirst({ where: eq(mod.schema.knowledgeSource.id, id) });
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, jobs, retrieve, ingest, confluence, connection] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/jobs"),
      import("@/lib/knowledge/retrieve"),
      import("@/lib/knowledge/ingest"),
      import("@/lib/atlassian/confluence"),
      import("@/lib/atlassian/connection"),
    ]);
    mod = { db, pool, schema, jobs, retrieve, ingest, confluence, connection };
    const now = new Date();
    await db.insert(schema.user).values({
      id: userId,
      name: "Test user",
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.organization).values({ id: orgId, name: "Test org", createdAt: now });
    await db.insert(schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
    const row = await connection.saveAtlassianConnection(orgId, userId, {
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "read:page:confluence",
    });
    connectionId = row.id;
  });

  beforeEach(() => {
    site.pages = initialPages();
    site.requests = [];
    embedded.length = 0;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => fakeConfluence(input, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (!mod) return;
    const { eq } = await import("drizzle-orm");
    await mod.db.delete(mod.schema.organization).where(eq(mod.schema.organization.id, orgId));
    await mod.db.delete(mod.schema.user).where(eq(mod.schema.user.id, userId));
    await mod.pool.end();
  });

  it("indexes every page of the space and cites it without links", async () => {
    const sourceId = await addSpaceSource();

    const source = await sourceRow(sourceId);
    expect(source).toMatchObject({ status: "indexed", pageCount: 3, errorMessage: null });
    expect(site.requests).toHaveLength(2);
    for (const request of site.requests) {
      expect(request.searchParams.get("body-format")).toBe("storage");
      expect(request.searchParams.get("status")).toBe("current");
    }

    const result = await mod.retrieve.retrieveKnowledge({ productId, query: "can annual plans be refunded" });
    const top = result.chunks[0];
    expect(top).toMatchObject({ sourceId, title: "Refund policy", url: null });
    expect(top.content).toContain("refunded within thirty days");
    expect(mod.retrieve.citationsFor(result.chunks).every((citation) => citation.url === null)).toBe(true);
  });

  it("re-embeds only pages edited since the last sync", async () => {
    const sourceId = await addSpaceSource();
    embedded.length = 0;

    await expect(mod.ingest.syncSourceIfChanged(sourceId)).resolves.toBe("skipped");
    expect(embedded).toEqual([]);

    site.pages[1] = { ...site.pages[1], version: 3, storage: "<p>Enterprise workspaces can enforce SAML or OIDC single sign-on.</p>" };
    await expect(mod.ingest.syncSourceIfChanged(sourceId)).resolves.toBe("reindexed");
    expect(embedded).toHaveLength(1);
    expect(embedded[0]).toContain("SAML or OIDC");
    expect(await sourceRow(sourceId)).toMatchObject({ status: "indexed", pageCount: 3 });
  });

  it("keeps serving the last index and asks for a reconnect once access is revoked", async () => {
    const { eq } = await import("drizzle-orm");
    const sourceId = await addSpaceSource();
    const setStatus = (status: string) =>
      mod.db
        .update(mod.schema.atlassianConnection)
        .set({ status })
        .where(eq(mod.schema.atlassianConnection.id, connectionId));

    await setStatus("reauth_required");
    try {
      await expect(mod.ingest.ingestSource(sourceId)).rejects.toThrow(mod.connection.REAUTH_MESSAGE);
      expect(await sourceRow(sourceId)).toMatchObject({
        status: "indexed",
        errorMessage: `Last refresh failed: ${mod.connection.REAUTH_MESSAGE}`,
      });
    } finally {
      await setStatus("active");
    }
  });

  it("explains a space that can no longer be read", async () => {
    const sourceId = await addSpaceSource("404404");
    const source = await sourceRow(sourceId);
    expect(source?.status).toBe("error");
    expect(source?.errorMessage).toContain('The Confluence space "Help" could not be read');
  });

  it("stops at the page limit and reports that more pages exist", async () => {
    const atLimit = await mod.confluence.listSpacePages(connectionId, CLOUD_ID, SPACE_ID, 4);
    expect(atLimit.pages.map((page) => page.id)).toEqual(["1001", "1002", "1003", "1004"]);
    expect(atLimit.truncated).toBe(false);

    const capped = await mod.confluence.listSpacePages(connectionId, CLOUD_ID, SPACE_ID, 3);
    expect(capped.pages.map((page) => page.id)).toEqual(["1001", "1002", "1003"]);
    expect(capped.truncated).toBe(true);
  });

  it("lists the site's spaces across pages", async () => {
    site.spaces = [
      { id: "1", key: "DOCS", name: "Docs", type: "global" },
      { id: "2", key: "HELP", name: "Help", type: "global" },
      { id: "3", key: "OPS", name: "Operations", type: "global" },
    ];
    await expect(mod.confluence.listConfluenceSpaces(connectionId, CLOUD_ID)).resolves.toEqual([
      { id: "1", key: "DOCS", name: "Docs" },
      { id: "2", key: "HELP", name: "Help" },
      { id: "3", key: "OPS", name: "Operations" },
    ]);
    expect(site.requests[0].searchParams.get("status")).toBe("current");
  });
});
