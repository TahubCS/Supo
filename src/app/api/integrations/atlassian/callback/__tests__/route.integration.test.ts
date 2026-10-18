// Integration test: requires a Postgres database with all migrations applied.
// Runs only when TEST_DATABASE_URL is set.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
process.env.INTEGRATIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.ATLASSIAN_CLIENT_ID ??= "test-client";
process.env.ATLASSIAN_CLIENT_SECRET ??= "test-secret";

// The signed-in user and their role in the product the connect started from.
const session = { userId: "", role: "developer" as "admin" | "developer" | "agent", organizationId: "" };
vi.mock("@/lib/product-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/product-access")>()),
  getProductAccess: async (productId: string) => ({
    session: { user: { id: session.userId, name: "Test user" } },
    membership: { organizationId: session.organizationId, role: "member" },
    product: { id: productId, organizationId: session.organizationId },
    role: session.role,
    isWorkspaceOwner: false,
  }),
}));

const audits: { action: string; metadata?: Record<string, unknown> }[] = [];
vi.mock("@/lib/audit", () => ({
  recordProductAudit: async (event: { action: string; metadata?: Record<string, unknown> }) => void audits.push(event),
}));

// Stands in for Atlassian's token and accessible-resources endpoints.
const atlassian = { requests: [] as string[], resources: [] as unknown[] };

describe.skipIf(!DATABASE_URL)("Atlassian connect callback (database)", () => {
  const productId = `prod_${crypto.randomUUID()}`;
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    route: typeof import("@/app/api/integrations/atlassian/callback/route");
    state: typeof import("@/lib/connect-state");
  };

  async function callback(params: Record<string, string>) {
    const { NextRequest } = await import("next/server");
    const url = `http://localhost:3000/api/integrations/atlassian/callback?${new URLSearchParams(params)}`;
    const response = await mod.route.GET(new NextRequest(url));
    const location = new URL(response.headers.get("location")!);
    return `${location.pathname}${location.search}`;
  }

  async function storedConnection() {
    const { eq } = await import("drizzle-orm");
    return mod.db.query.atlassianConnection.findFirst({
      where: eq(mod.schema.atlassianConnection.organizationId, session.organizationId),
    });
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, route, state] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/app/api/integrations/atlassian/callback/route"),
      import("@/lib/connect-state"),
    ]);
    mod = { db, pool, schema, route, state };
  });

  beforeEach(async () => {
    // A fresh workspace and user per test.
    const now = new Date();
    session.organizationId = `org_${crypto.randomUUID()}`;
    session.userId = `user_${crypto.randomUUID()}`;
    session.role = "developer";
    orgIds.push(session.organizationId);
    userIds.push(session.userId);
    await mod.db.insert(mod.schema.organization).values({ id: session.organizationId, name: "Test org", createdAt: now });
    await mod.db.insert(mod.schema.user).values({
      id: session.userId,
      name: "Test user",
      email: `${session.userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    audits.length = 0;
    atlassian.requests = [];
    atlassian.resources = [
      { id: "cloud-1", url: "https://acme.atlassian.net", name: "Acme", scopes: ["read:space:confluence", "read:page:confluence"] },
    ];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      atlassian.requests.push(url);
      if (url === "https://auth.atlassian.com/oauth/token") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          grant_type: "authorization_code",
          code: "code-1",
          redirect_uri: "http://localhost:3000/api/integrations/atlassian/callback",
        });
        return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "read:page:confluence" });
      }
      if (url === "https://api.atlassian.com/oauth/token/accessible-resources") return Response.json(atlassian.resources);
      throw new Error(`Unexpected request to ${url}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (!mod) return;
    const { inArray } = await import("drizzle-orm");
    if (orgIds.length > 0) await mod.db.delete(mod.schema.organization).where(inArray(mod.schema.organization.id, orgIds));
    if (userIds.length > 0) await mod.db.delete(mod.schema.user).where(inArray(mod.schema.user.id, userIds));
    await mod.pool.end();
  });

  const stateFor = (userId = session.userId) => mod.state.createConnectState("atlassian", productId, userId);

  it("stores the grant for the product's workspace and returns to the knowledge page", async () => {
    await expect(callback({ code: "code-1", state: stateFor() })).resolves.toBe(
      `/products/${productId}/knowledge?atlassian=connected`,
    );

    const connection = await storedConnection();
    expect(connection).toMatchObject({ status: "active", createdById: session.userId });
    expect(connection?.accessToken).not.toContain("access-1");
    expect(audits).toEqual([
      expect.objectContaining({ action: "knowledge.atlassian_connected", metadata: { sites: ["https://acme.atlassian.net"] } }),
    ]);
  });

  it("rejects a state that was not issued for Atlassian", async () => {
    const githubState = mod.state.createConnectState("github", productId, session.userId);
    await expect(callback({ code: "code-1", state: githubState })).resolves.toBe("/dashboard?atlassian=expired");
    expect(atlassian.requests).toEqual([]);
  });

  it("rejects a round trip started by someone else, or without knowledge access", async () => {
    await expect(callback({ code: "code-1", state: stateFor("user_someone_else") })).resolves.toBe(
      "/dashboard?atlassian=forbidden",
    );
    session.role = "agent";
    await expect(callback({ code: "code-1", state: stateFor() })).resolves.toBe("/dashboard?atlassian=forbidden");
    expect(atlassian.requests).toEqual([]);
    expect(await storedConnection()).toBeUndefined();
  });

  it("does not store a grant that can't read Confluence anywhere", async () => {
    atlassian.resources = [{ id: "cloud-2", url: "https://acme-jira.atlassian.net", name: "Jira only", scopes: ["read:jira-work"] }];
    await expect(callback({ code: "code-1", state: stateFor() })).resolves.toBe(
      `/products/${productId}/knowledge?atlassian=no-sites`,
    );
    expect(await storedConnection()).toBeUndefined();
  });

  it("reports a declined consent without contacting Atlassian", async () => {
    await expect(callback({ error: "access_denied", state: stateFor() })).resolves.toBe(
      `/products/${productId}/knowledge?atlassian=cancelled`,
    );
    expect(atlassian.requests).toEqual([]);
  });
});
