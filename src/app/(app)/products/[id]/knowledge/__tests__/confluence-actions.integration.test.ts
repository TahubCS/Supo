// Integration test: requires a Postgres database with all migrations applied.
// Runs only when TEST_DATABASE_URL is set.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
process.env.INTEGRATIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.ATLASSIAN_CLIENT_ID ??= "test-client";
process.env.ATLASSIAN_CLIENT_SECRET ??= "test-secret";

// The signed-in user: a product developer whose workspace role varies per test.
const session = { userId: "", organizationId: "", workspaceRole: "member" };
vi.mock("@/lib/product-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/product-access")>()),
  requireProductAccess: async (productId: string) => ({
    session: { user: { id: session.userId, name: "Test user" } },
    membership: { organizationId: session.organizationId, role: session.workspaceRole },
    product: { id: productId, organizationId: session.organizationId },
    role: "developer",
    isWorkspaceOwner: session.workspaceRole === "owner",
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/security", () => ({ requireSecurityQuota: async () => undefined }));
const queued: string[] = [];
vi.mock("@/lib/jobs", () => ({
  queueSourceIndexing: async (sourceId: string) => void queued.push(sourceId),
  drainSoon: () => undefined,
}));
const audits: string[] = [];
vi.mock("@/lib/audit", () => ({ recordProductAudit: async (event: { action: string }) => void audits.push(event.action) }));

const CLOUD_ID = "cloud-1";
const SPACES = [
  { id: "1", key: "HELP", name: "Help center" },
  { id: "2", key: "ENG", name: "Engineering" },
];

describe.skipIf(!DATABASE_URL)("Confluence knowledge actions (database)", () => {
  const productId = `prod_${crypto.randomUUID()}`;
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    actions: typeof import("@/app/(app)/products/[id]/knowledge/actions");
    connection: typeof import("@/lib/atlassian/connection");
  };

  async function connect() {
    return mod.connection.saveAtlassianConnection(session.organizationId, session.userId, {
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "read:page:confluence",
    });
  }

  async function sourcesOfProduct() {
    const { eq } = await import("drizzle-orm");
    return mod.db.query.knowledgeSource.findMany({ where: eq(mod.schema.knowledgeSource.productId, productId) });
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, actions, connection] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/app/(app)/products/[id]/knowledge/actions"),
      import("@/lib/atlassian/connection"),
    ]);
    mod = { db, pool, schema, actions, connection };
  });

  beforeEach(async () => {
    const now = new Date();
    session.organizationId = `org_${crypto.randomUUID()}`;
    session.userId = `user_${crypto.randomUUID()}`;
    session.workspaceRole = "member";
    await mod.db.insert(mod.schema.organization).values({ id: session.organizationId, name: "Test org", createdAt: now });
    await mod.db.insert(mod.schema.user).values({
      id: session.userId,
      name: "Test user",
      email: `${session.userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await mod.db
      .insert(mod.schema.product)
      .values({ id: productId, organizationId: session.organizationId, name: "Acme", createdAt: now, updatedAt: now });
    queued.length = 0;
    audits.length = 0;

    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input);
      const base = `/ex/confluence/${CLOUD_ID}/wiki/api/v2`;
      if (url.pathname === "/oauth/token/accessible-resources") {
        return Response.json([
          { id: CLOUD_ID, url: "https://acme.atlassian.net", name: "Acme", scopes: ["read:page:confluence"] },
        ]);
      }
      if (url.pathname === `${base}/spaces`) return Response.json({ results: SPACES, _links: {} });
      const space = SPACES.find((candidate) => url.pathname === `${base}/spaces/${candidate.id}`);
      if (space) return Response.json({ ...space, type: "global", status: "current" });
      return Response.json({ errors: [{ status: 404 }] }, { status: 404 });
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { eq } = await import("drizzle-orm");
    await mod.db.delete(mod.schema.organization).where(eq(mod.schema.organization.id, session.organizationId));
    await mod.db.delete(mod.schema.user).where(eq(mod.schema.user.id, session.userId));
  });

  afterAll(async () => {
    await mod?.pool.end();
  });

  it("reports whether Confluence is connected, and when it needs reconnecting", async () => {
    const { eq } = await import("drizzle-orm");
    await expect(mod.actions.getConfluenceConnection(productId)).resolves.toMatchObject({
      configured: true,
      status: "disconnected",
      canDisconnect: false,
    });

    const connection = await connect();
    const active = await mod.actions.getConfluenceConnection(productId);
    expect(active).toMatchObject({ status: "active", sites: [{ cloudId: CLOUD_ID, name: "Acme" }] });
    expect(new URL(active.connectUrl!).searchParams.get("state")).toBeTruthy();

    await mod.db
      .update(mod.schema.atlassianConnection)
      .set({ status: "reauth_required" })
      .where(eq(mod.schema.atlassianConnection.id, connection.id));
    await expect(mod.actions.getConfluenceConnection(productId)).resolves.toMatchObject({
      status: "reauth_required",
      sites: [],
    });
  });

  it("adds a space with details from Atlassian, never a link, and only once", async () => {
    const connection = await connect();
    const id = await mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "1", name: " " });

    const [source] = await sourcesOfProduct();
    expect(source).toMatchObject({
      id,
      type: "confluence",
      name: "Help center",
      url: null,
      status: "indexing",
      atlassianConnectionId: connection.id,
      settings: {
        confluence: {
          cloudId: CLOUD_ID,
          siteUrl: "https://acme.atlassian.net",
          siteName: "Acme",
          spaceId: "1",
          spaceKey: "HELP",
          spaceName: "Help center",
        },
      },
    });
    expect(queued).toEqual([id]);

    await expect(mod.actions.listConfluenceSpaceOptions(productId, CLOUD_ID)).resolves.toEqual([
      { ...SPACES[0], alreadyAdded: true },
      { ...SPACES[1], alreadyAdded: false },
    ]);
    await expect(mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "1" })).rejects.toThrow(
      "Help center is already in this knowledge base",
    );
  });

  it("refuses sites and spaces the connected account can't read", async () => {
    await expect(mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "1" })).rejects.toThrow(
      "Connect Confluence first",
    );
    await connect();
    await expect(mod.actions.addConfluenceSource(productId, { cloudId: "cloud-other", spaceId: "1" })).rejects.toThrow(
      "This Confluence site is not available",
    );
    await expect(mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "999" })).rejects.toThrow(
      "This space doesn't exist",
    );
    expect(await sourcesOfProduct()).toEqual([]);
  });

  it("renames a Confluence source without re-indexing it", async () => {
    await connect();
    const id = await mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "2" });
    queued.length = 0;

    await mod.actions.updateSource(id, { name: "Eng handbook", url: "https://example.com" });
    const [source] = await sourcesOfProduct();
    expect(source).toMatchObject({ name: "Eng handbook", url: null, revision: 0 });
    expect(queued).toEqual([]);
  });

  it("lets only workspace owners and admins disconnect, which removes the workspace's Confluence sources", async () => {
    await connect();
    await mod.actions.addConfluenceSource(productId, { cloudId: CLOUD_ID, spaceId: "1" });

    await expect(mod.actions.disconnectConfluence(productId)).rejects.toThrow("Only workspace owners and admins");
    expect(await sourcesOfProduct()).toHaveLength(1);

    session.workspaceRole = "admin";
    await mod.actions.disconnectConfluence(productId);
    expect(await sourcesOfProduct()).toEqual([]);
    await expect(mod.actions.getConfluenceConnection(productId)).resolves.toMatchObject({
      status: "disconnected",
      canDisconnect: true,
    });
    expect(audits).toContain("knowledge.atlassian_disconnected");
  });
});
