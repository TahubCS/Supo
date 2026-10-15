// Integration test: requires a Postgres database with pgvector and all
// migrations applied. Runs only when TEST_DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;

const queued = vi.hoisted(() => ({ sync: [] as string[], index: [] as string[] }));
vi.mock("@/lib/jobs", () => ({
  queueSourceSync: async (id: string) => {
    queued.sync.push(id);
    return id;
  },
  queueSourceIndexing: async (id: string) => {
    queued.index.push(id);
    return id;
  },
}));

describe.skipIf(!DATABASE_URL)("GitHub App webhooks (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const installationId = Math.floor(Math.random() * 1e9) + 1;
  const repoId = Math.floor(Math.random() * 1e9) + 1;
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    webhook: typeof import("@/lib/github/webhook");
  };

  const repository = { id: repoId, full_name: "acme/docs", private: true, default_branch: "main" };

  async function addSource(settings: Partial<import("@/db/schema").GitHubSourceSettings> = {}) {
    const id = crypto.randomUUID();
    const now = new Date();
    await mod.db.insert(mod.schema.knowledgeSource).values({
      id,
      productId,
      type: "github",
      name: "acme/docs",
      url: "https://github.com/acme/docs",
      status: "indexed",
      chunkCount: 3,
      settings: {
        github: {
          fullName: "acme/docs",
          private: true,
          branch: null,
          includePaths: [],
          excludePaths: [],
          includeReleases: true,
          includeIssues: false,
          ...settings,
        },
      },
      githubInstallationId: installationId,
      githubRepoId: repoId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async function getSource(id: string) {
    const { eq } = await import("drizzle-orm");
    return mod.db.query.knowledgeSource.findFirst({ where: eq(mod.schema.knowledgeSource.id, id) });
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, webhook] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/github/webhook"),
    ]);
    mod = { db, pool, schema, webhook };
    const now = new Date();
    await db.insert(schema.organization).values({ id: orgId, name: "Test org", createdAt: now });
    await db.insert(schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
  });

  beforeEach(async () => {
    queued.sync = [];
    queued.index = [];
    const { eq } = await import("drizzle-orm");
    await mod.db.delete(mod.schema.knowledgeSource).where(eq(mod.schema.knowledgeSource.productId, productId));
  });

  afterAll(async () => {
    if (!mod) return;
    const { eq } = await import("drizzle-orm");
    await mod.db.delete(mod.schema.organization).where(eq(mod.schema.organization.id, orgId));
    await mod.pool.end();
  });

  it("syncs sources on a push to the tracked branch only", async () => {
    const onDefault = await addSource();
    const onRelease = await addSource({ branch: "release" });
    const installation = { id: installationId };

    await mod.webhook.handleGitHubWebhook("push", { installation, repository, ref: "refs/heads/main" });
    expect(queued.sync).toEqual([onDefault]);

    queued.sync = [];
    await mod.webhook.handleGitHubWebhook("push", { installation, repository, ref: "refs/heads/release" });
    expect(queued.sync).toEqual([onRelease]);

    queued.sync = [];
    await mod.webhook.handleGitHubWebhook("push", { installation, repository, ref: "refs/tags/v1" });
    // Another installation's event never touches these sources.
    await mod.webhook.handleGitHubWebhook("push", { installation: { id: installationId + 1 }, repository, ref: "refs/heads/main" });
    expect(queued.sync).toEqual([]);
  });

  it("only syncs on releases and issues when the source includes them", async () => {
    const releasesOnly = await addSource({ includeReleases: true, includeIssues: false });
    const installation = { id: installationId };
    await mod.webhook.handleGitHubWebhook("release", { action: "published", installation, repository });
    await mod.webhook.handleGitHubWebhook("issues", { action: "opened", installation, repository });
    expect(queued.sync).toEqual([releasesOnly]);
  });

  it("takes sources out of retrieval when the app is uninstalled or loses repository access", async () => {
    const { eq } = await import("drizzle-orm");
    const now = new Date();
    await mod.db.insert(mod.schema.githubInstallation).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      installationId,
      accountLogin: "acme",
      accountType: "Organization",
      createdAt: now,
      updatedAt: now,
    });

    const removed = await addSource();
    await mod.webhook.handleGitHubWebhook("installation_repositories", {
      action: "removed",
      installation: { id: installationId },
      repositories_removed: [{ id: repoId }],
    });
    expect(await getSource(removed)).toMatchObject({ status: "error", revision: 1 });

    // Access granted again: re-indexed.
    await mod.webhook.handleGitHubWebhook("installation_repositories", {
      action: "added",
      installation: { id: installationId },
      repositories_added: [{ id: repoId }],
    });
    expect(queued.index).toEqual([removed]);
    expect((await getSource(removed))?.status).toBe("indexing");

    await mod.webhook.handleGitHubWebhook("installation", { action: "deleted", installation: { id: installationId } });
    expect((await getSource(removed))?.status).toBe("error");
    const links = await mod.db.query.githubInstallation.findMany({
      where: eq(mod.schema.githubInstallation.installationId, installationId),
    });
    expect(links).toEqual([]);
  });

  it("follows repository renames", async () => {
    const id = await addSource();
    await mod.webhook.handleGitHubWebhook("repository", {
      action: "renamed",
      installation: { id: installationId },
      repository: { ...repository, full_name: "acme/handbook" },
    });
    const source = await getSource(id);
    expect(source?.url).toBe("https://github.com/acme/handbook");
    expect(source?.settings?.github?.fullName).toBe("acme/handbook");
    expect(source?.settings?.github?.includeReleases).toBe(true);
  });
});
