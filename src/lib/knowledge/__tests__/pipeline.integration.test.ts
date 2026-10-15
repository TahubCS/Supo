// Integration test: requires a Postgres database with pgvector and all
// migrations applied. Runs only when TEST_DATABASE_URL is set, e.g.
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/supo?sslmode=disable bun run test
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeEmbedding } from "@/test/fake-embeddings";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

// Lets a test run code in the middle of an ingest (between loading content and
// swapping chunks), e.g. to simulate an edit landing mid-run.
const hooks: { duringEmbed: (() => Promise<void>) | null } = { duringEmbed: null };
vi.mock("@/lib/knowledge/ai", () => ({
  geminiEmbedQuery: async (text: string) => ({ embedding: fakeEmbedding(text), model: "fake-embed" }),
  geminiEmbedManyWithModel: async (texts: string[]) => {
    if (hooks.duringEmbed) await hooks.duringEmbed();
    return { embeddings: texts.map(fakeEmbedding), model: "fake-embed" };
  },
  geminiGenerate: async () => "stub",
}));

describe.skipIf(!DATABASE_URL)("knowledge pipeline (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const otherProductId = `prod_${crypto.randomUUID()}`;
  let mod: {
    db: typeof import("@/db").db;
    pool: typeof import("@/db").pool;
    schema: typeof import("@/db/schema");
    jobs: typeof import("@/lib/jobs");
    retrieve: typeof import("@/lib/knowledge/retrieve");
  };

  async function addArticle(product: string, name: string, content: string) {
    const id = crypto.randomUUID();
    const now = new Date();
    await mod.db.insert(mod.schema.knowledgeSource).values({
      id,
      productId: product,
      type: "article",
      name,
      content,
      status: "indexing",
      indexingStartedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId: id }, { dedupeKey: `knowledge.ingest:${id}` });
    await mod.jobs.runJobNow(jobId);
    return id;
  }

  beforeAll(async () => {
    const [{ db, pool }, schema, jobs, retrieve] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/jobs"),
      import("@/lib/knowledge/retrieve"),
    ]);
    mod = { db, pool, schema, jobs, retrieve };
    const now = new Date();
    await db.insert(schema.organization).values({ id: orgId, name: "Test org", createdAt: now });
    await db.insert(schema.product).values([
      { id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now },
      { id: otherProductId, organizationId: orgId, name: "Other", createdAt: now, updatedAt: now },
    ]);
  });

  afterAll(async () => {
    if (!mod) return;
    const { eq } = await import("drizzle-orm");
    await mod.db.delete(mod.schema.organization).where(eq(mod.schema.organization.id, orgId));
    await mod.pool.end();
  });

  it("indexes an article through the job queue and retrieves the right passage", async () => {
    const { eq } = await import("drizzle-orm");
    const longPolicy = [
      "# Billing",
      "## Refunds",
      "Refunds are available within thirty days of purchase for annual plans. Contact billing support to request a refund.",
      "## Invoices",
      "Invoices are emailed monthly and can be downloaded as PDF from the account settings page.",
      "# Security",
      "We support single sign on with SAML and enforce two factor authentication for administrators.",
      ...Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i} about unrelated onboarding checklists and workspace setup tips.`),
    ].join("\n\n");

    const sourceId = await addArticle(productId, "Help center", longPolicy);
    // Same words in another product must never leak into this product's results.
    await addArticle(otherProductId, "Other product", "Refunds are never available. Refund requests are always denied.");

    const source = await mod.db.query.knowledgeSource.findFirst({
      where: eq(mod.schema.knowledgeSource.id, sourceId),
    });
    expect(source?.status).toBe("indexed");
    expect(source?.chunkCount).toBeGreaterThan(2);

    const chunks = await mod.db.query.knowledgeChunk.findMany({
      where: eq(mod.schema.knowledgeChunk.sourceId, sourceId),
    });
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(1200);
    expect(chunks.every((c) => c.embeddingModel === "fake-embed")).toBe(true);

    const result = await mod.retrieve.retrieveKnowledge({ productId, query: "how do refunds work for annual plans" });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].content).toContain("Refunds are available within thirty days");
    expect(result.chunks[0].headingPath).toEqual(["Billing", "Refunds"]);
    expect(result.candidates.every((c) => c.sourceId !== undefined)).toBe(true);
    expect(result.chunks.some((c) => c.content.includes("always denied"))).toBe(false);

    // Keyword search catches exact terms like "SAML".
    const sso = await mod.retrieve.retrieveKnowledge({ productId, query: "SAML" });
    expect(sso.chunks[0]?.content).toContain("SAML");
  });

  it("excludes disabled sources from retrieval", async () => {
    const { eq } = await import("drizzle-orm");
    const sourceId = await addArticle(productId, "Shipping", "Shipping to Canada takes five business days via express courier delivery.");
    const before = await mod.retrieve.retrieveKnowledge({ productId, query: "shipping canada courier delivery" });
    expect(before.chunks.some((c) => c.sourceId === sourceId)).toBe(true);

    await mod.db
      .update(mod.schema.knowledgeSource)
      .set({ enabled: false })
      .where(eq(mod.schema.knowledgeSource.id, sourceId));
    const after = await mod.retrieve.retrieveKnowledge({ productId, query: "shipping canada courier delivery" });
    expect(after.chunks.some((c) => c.sourceId === sourceId)).toBe(false);
  });

  it("marks a source as failed after the final attempt and keeps jobs de-duplicated", async () => {
    const { eq } = await import("drizzle-orm");
    const id = crypto.randomUUID();
    const now = new Date();
    await mod.db.insert(mod.schema.knowledgeSource).values({
      id,
      productId,
      type: "article",
      name: "Empty",
      content: "   ",
      status: "indexing",
      createdAt: now,
      updatedAt: now,
    });

    const first = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId: id }, { dedupeKey: `k:${id}`, maxAttempts: 1 });
    const second = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId: id }, { dedupeKey: `k:${id}`, maxAttempts: 1 });
    expect(second).toBe(first);

    await mod.jobs.runJobNow(first);
    const source = await mod.db.query.knowledgeSource.findFirst({ where: eq(mod.schema.knowledgeSource.id, id) });
    expect(source?.status).toBe("error");
    expect(source?.errorMessage).toMatch(/No content/);

    const job = await mod.db.query.backgroundJob.findFirst({ where: eq(mod.schema.backgroundJob.id, first) });
    expect(job?.status).toBe("failed");
  });

  it("does not overwrite an edit that lands while an ingest is running", async () => {
    const { eq, sql } = await import("drizzle-orm");
    const sourceId = await addArticle(productId, "Returns", "Returns are accepted within fourteen days of delivery for unused items.");

    hooks.duringEmbed = async () => {
      hooks.duringEmbed = null;
      await mod.db
        .update(mod.schema.knowledgeSource)
        .set({
          content: "Returns are accepted within sixty days of delivery, no questions asked.",
          revision: sql`${mod.schema.knowledgeSource.revision} + 1`,
        })
        .where(eq(mod.schema.knowledgeSource.id, sourceId));
    };
    const stale = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId }, { dedupeKey: `knowledge.ingest:${sourceId}` });
    await mod.jobs.runJobNow(stale);

    // The stale run must not have replaced the chunks with old content…
    let chunks = await mod.db.query.knowledgeChunk.findMany({ where: eq(mod.schema.knowledgeChunk.sourceId, sourceId) });
    expect(chunks.every((c) => !c.content.includes("sixty"))).toBe(true);

    // …and the follow-up job indexes the edited content.
    const followUp = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId }, { dedupeKey: `knowledge.ingest:${sourceId}` });
    expect(followUp).not.toBe(stale);
    await mod.jobs.runJobNow(followUp);
    chunks = await mod.db.query.knowledgeChunk.findMany({ where: eq(mod.schema.knowledgeChunk.sourceId, sourceId) });
    expect(chunks.some((c) => c.content.includes("sixty days"))).toBe(true);
  });

  it("ignores a stale run's failure after a newer edit", async () => {
    const { eq, sql } = await import("drizzle-orm");
    const sourceId = await addArticle(productId, "Warranty", "Every device has a two year warranty covering manufacturing defects.");
    hooks.duringEmbed = async () => {
      hooks.duringEmbed = null;
      await mod.db
        .update(mod.schema.knowledgeSource)
        .set({ revision: sql`${mod.schema.knowledgeSource.revision} + 1` })
        .where(eq(mod.schema.knowledgeSource.id, sourceId));
      throw new Error("embedding service unavailable");
    };
    const stale = await mod.jobs.enqueueJob("knowledge.ingest", { sourceId }, { dedupeKey: `stale-fail:${sourceId}`, maxAttempts: 1 });
    await mod.jobs.runJobNow(stale);
    const source = await mod.db.query.knowledgeSource.findFirst({ where: eq(mod.schema.knowledgeSource.id, sourceId) });
    // The newer revision's state is untouched by the old run's error.
    expect(source).toMatchObject({ status: "indexed", errorMessage: null });
  });

  it("retires a failing job when its follow-up is already queued instead of getting stuck", async () => {
    const { eq } = await import("drizzle-orm");
    const queue = await import("@/lib/jobs/queue");
    const key = `test.supersede:${crypto.randomUUID()}`;
    let followUp = "";
    queue.registerJobHandler("test.supersede", async () => {
      // An edit queues a follow-up while this run is still going, then the run fails.
      followUp = await mod.jobs.enqueueJob("test.supersede", {}, { dedupeKey: key });
      throw new Error("transient failure");
    });
    const first = await mod.jobs.enqueueJob("test.supersede", {}, { dedupeKey: key, maxAttempts: 3 });
    await expect(mod.jobs.runJobNow(first)).resolves.toBeUndefined();

    const original = await mod.db.query.backgroundJob.findFirst({ where: eq(mod.schema.backgroundJob.id, first) });
    expect(original).toMatchObject({ status: "done", lastError: expect.stringContaining("Superseded") });
    expect(followUp).not.toBe(first);
    const next = await mod.db.query.backgroundJob.findFirst({ where: eq(mod.schema.backgroundJob.id, followUp) });
    expect(next?.status).toBe("queued");
    await mod.db.delete(mod.schema.backgroundJob).where(eq(mod.schema.backgroundJob.dedupeKey, key));
  });

  it("recovers stale jobs one by one when they share a dedupe key", async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const queue = await import("@/lib/jobs/queue");
    const key = `test.stale:${crypto.randomUUID()}`;
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await mod.db.insert(mod.schema.backgroundJob).values(
      ids.map((id, i) => ({
        id,
        type: "test.stale",
        payload: {},
        status: "running",
        attempts: 1,
        maxAttempts: 3,
        runAt: old,
        lockedAt: old,
        dedupeKey: i < 2 ? key : null,
        createdAt: old,
        updatedAt: old,
      })),
    );
    await expect(queue.recoverStaleJobs()).resolves.toBeGreaterThanOrEqual(2);
    const rows = await mod.db.query.backgroundJob.findMany({ where: inArray(mod.schema.backgroundJob.id, ids) });
    const shared = rows.filter((r) => r.dedupeKey === key).map((r) => r.status).sort();
    expect(shared).toEqual(["done", "queued"]);
    expect(rows.find((r) => r.id === ids[2])?.status).toBe("queued");
    await mod.db.delete(mod.schema.backgroundJob).where(inArray(mod.schema.backgroundJob.id, ids));
    void eq;
  });
});
