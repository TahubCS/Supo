// Integration test: requires a Postgres database with all migrations applied.
// Runs only when TEST_DATABASE_URL is set.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AtlassianTokens } from "@/lib/atlassian/oauth";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
process.env.INTEGRATIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.ATLASSIAN_CLIENT_ID ??= "test-client";
process.env.ATLASSIAN_CLIENT_SECRET ??= "test-secret";

// Stands in for Atlassian's token endpoint (via a stubbed fetch, so the real
// request and error handling in oauth.ts run); records every refresh token spent.
const refresh = {
  spent: [] as string[],
  respond: null as null | ((refreshToken: string) => Promise<Response>),
};

function issued(n: number): Response {
  return Response.json({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, scope: "s" });
}

function oauthError(status: number, error: string): Response {
  return Response.json({ error, error_description: `${error} from test` }, { status });
}

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe.skipIf(!DATABASE_URL)("Atlassian connection tokens (database)", () => {
  const userId = `user_${crypto.randomUUID()}`;
  const orgIds: string[] = [];
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    connection: typeof import("@/lib/atlassian/connection");
  };

  async function connect(tokens: Partial<AtlassianTokens> = {}) {
    const orgId = `org_${crypto.randomUUID()}`;
    orgIds.push(orgId);
    await mod.db.insert(mod.schema.organization).values({ id: orgId, name: "Test org", createdAt: new Date() });
    const row = await mod.connection.saveAtlassianConnection(orgId, userId, {
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: inOneHour(),
      scopes: "read:page:confluence",
      ...tokens,
    });
    return { orgId, id: row.id };
  }

  async function storedRow(id: string) {
    const { eq } = await import("drizzle-orm");
    return mod.db.query.atlassianConnection.findFirst({ where: eq(mod.schema.atlassianConnection.id, id) });
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, connection] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/atlassian/connection"),
    ]);
    mod = { db, pool, schema, connection };
    const now = new Date();
    await db.insert(schema.user).values({
      id: userId,
      name: "Test user",
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeEach(() => {
    refresh.spent = [];
    refresh.respond = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url !== "https://auth.atlassian.com/oauth/token") throw new Error(`Unexpected request to ${url}`);
      const body = JSON.parse(String(init.body)) as Record<string, string>;
      expect(body).toMatchObject({ grant_type: "refresh_token", client_id: "test-client", client_secret: "test-secret" });
      refresh.spent.push(body.refresh_token);
      return refresh.respond!(body.refresh_token);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (!mod) return;
    const { inArray } = await import("drizzle-orm");
    if (orgIds.length > 0) {
      await mod.db.delete(mod.schema.organization).where(inArray(mod.schema.organization.id, orgIds));
    }
    await mod.db.delete(mod.schema.user).where(inArray(mod.schema.user.id, [userId]));
    await mod.pool.end();
  });

  it("stores tokens encrypted and returns a fresh access token without refreshing", async () => {
    const { id } = await connect();
    const row = await storedRow(id);
    expect(row?.accessToken).not.toContain("access-1");
    expect(row?.refreshToken).not.toContain("refresh-1");

    await expect(mod.connection.getAccessToken(id)).resolves.toBe("access-1");
    expect(refresh.spent).toEqual([]);
  });

  it("refreshes once for concurrent callers and keeps the rotated refresh token", async () => {
    const { id } = await connect({ expiresAt: new Date(Date.now() - 1000) });
    refresh.respond = async (spent) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return issued(spent === "refresh-1" ? 2 : 3);
    };

    const tokens = await Promise.all([1, 2, 3].map(() => mod.connection.getAccessToken(id)));
    expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
    expect(refresh.spent).toEqual(["refresh-1"]);

    // The next refresh spends the rotated token, not the one Atlassian invalidated.
    await expect(mod.connection.getAccessToken(id, { force: true })).resolves.toBe("access-3");
    expect(refresh.spent).toEqual(["refresh-1", "refresh-2"]);
  });

  it("asks for a reconnect when Atlassian rejects the refresh token", async () => {
    const { id } = await connect({ expiresAt: new Date(Date.now() - 1000) });
    refresh.respond = async () => oauthError(403, "invalid_grant");

    await expect(mod.connection.getAccessToken(id)).rejects.toBeInstanceOf(mod.connection.AtlassianReauthRequiredError);
    expect((await storedRow(id))?.status).toBe("reauth_required");

    // No further refresh attempts once reconnecting is required.
    await expect(mod.connection.getAccessToken(id)).rejects.toBeInstanceOf(mod.connection.AtlassianReauthRequiredError);
    expect(refresh.spent).toEqual(["refresh-1"]);
  });

  it("asks for a reconnect when the stored tokens can't be decrypted", async () => {
    const { id } = await connect();
    const original = process.env.INTEGRATIONS_ENCRYPTION_KEY;
    // The key was changed, so nothing sealed with the old one opens.
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    try {
      await expect(mod.connection.getAccessToken(id)).rejects.toBeInstanceOf(mod.connection.AtlassianReauthRequiredError);
      expect((await storedRow(id))?.status).toBe("reauth_required");
      expect(refresh.spent).toEqual([]);
    } finally {
      process.env.INTEGRATIONS_ENCRYPTION_KEY = original;
    }
  });

  it("refreshes when only the access token can't be decrypted", async () => {
    const { eq } = await import("drizzle-orm");
    const { id } = await connect();
    await mod.db
      .update(mod.schema.atlassianConnection)
      .set({ accessToken: "v1.altered.value.x" })
      .where(eq(mod.schema.atlassianConnection.id, id));
    refresh.respond = async () => issued(2);

    await expect(mod.connection.getAccessToken(id)).resolves.toBe("access-2");
    expect(refresh.spent).toEqual(["refresh-1"]);
    expect((await storedRow(id))?.status).toBe("active");
  });

  it("keeps the connection usable when a refresh fails for another reason", async () => {
    const { id } = await connect({ expiresAt: new Date(Date.now() - 1000) });
    refresh.respond = async () => oauthError(503, "temporarily_unavailable");
    await expect(mod.connection.getAccessToken(id)).rejects.toThrow("503");
    expect((await storedRow(id))?.status).toBe("active");

    refresh.respond = async () => issued(2);
    await expect(mod.connection.getAccessToken(id)).resolves.toBe("access-2");
    expect(refresh.spent).toEqual(["refresh-1", "refresh-1"]);
  });

  it("reconnecting replaces the grant and reactivates the connection", async () => {
    const { orgId, id } = await connect({ expiresAt: new Date(Date.now() - 1000) });
    refresh.respond = async () => oauthError(403, "invalid_grant");
    await expect(mod.connection.getAccessToken(id)).rejects.toThrow();

    const row = await mod.connection.saveAtlassianConnection(orgId, userId, {
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresAt: inOneHour(),
      scopes: "s",
    });
    expect(row.id).toBe(id);
    expect(row.status).toBe("active");
    await expect(mod.connection.getAccessToken(id)).resolves.toBe("access-new");
  });

  it("disconnecting removes the workspace's Confluence sources", async () => {
    const { eq } = await import("drizzle-orm");
    const { orgId, id } = await connect();
    const productId = `prod_${crypto.randomUUID()}`;
    const sourceId = crypto.randomUUID();
    const now = new Date();
    await mod.db.insert(mod.schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
    await mod.db.insert(mod.schema.knowledgeSource).values({
      id: sourceId,
      productId,
      type: "confluence",
      name: "Docs space",
      atlassianConnectionId: id,
      createdAt: now,
      updatedAt: now,
    });

    await mod.connection.deleteAtlassianConnection(orgId);
    expect(await storedRow(id)).toBeUndefined();
    expect(
      await mod.db.query.knowledgeSource.findFirst({ where: eq(mod.schema.knowledgeSource.id, sourceId) }),
    ).toBeUndefined();
  });
});
