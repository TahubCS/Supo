// Help center authoring, knowledge-base mirroring, search, feedback and the
// widget's suggested articles against Postgres. Auth, cache revalidation and
// the job queue are stubbed. Runs only when TEST_DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const enqueued: { type: string; payload: Record<string, unknown> }[] = [];
const ids = { org: `org_${crypto.randomUUID()}`, product: `prod_${crypto.randomUUID()}`, user: `user_${crypto.randomUUID()}` };

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/jobs/queue", () => ({
  drainSoon: () => {},
  registerJobHandler: () => {},
  registerSweeper: () => {},
  enqueueAndKick: async (type: string, payload: Record<string, unknown>) => {
    enqueued.push({ type, payload });
    return "job";
  },
}));
vi.mock("@/lib/product-access", () => ({
  requireProductAccess: async (productId: string) => ({
    session: { user: { id: ids.user, name: "Writer" } },
    product: { id: productId, organizationId: ids.org },
    role: "admin",
  }),
}));

describe.skipIf(!DATABASE_URL)("help center (database)", () => {
  let dbm: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let actions: typeof import("@/app/(app)/products/[id]/help-center/actions");
  let service: typeof import("@/lib/help-center/service");
  let feedback: typeof import("@/app/api/help/feedback/route");
  let widgetConfig: typeof import("@/app/api/widget/config/route");
  let eq: typeof import("drizzle-orm").eq;

  const ok = <T,>(result: { ok: true; value?: T } | { ok: false; error: string }) => {
    if (!result.ok) throw new Error(result.error);
    return (result as { value: T }).value;
  };
  const source = async (articleId: string) => {
    const row = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, articleId) });
    return row?.knowledgeSourceId
      ? dbm.db.query.knowledgeSource.findFirst({ where: eq(schema.knowledgeSource.id, row.knowledgeSourceId) })
      : null;
  };

  beforeAll(async () => {
    [dbm, schema, actions, service, feedback, widgetConfig, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/app/(app)/products/[id]/help-center/actions"),
      import("@/lib/help-center/service"),
      import("@/app/api/help/feedback/route"),
      import("@/app/api/widget/config/route"),
      import("drizzle-orm"),
    ]);
    const now = new Date();
    await dbm.db.insert(schema.organization).values({ id: ids.org, name: "Org", createdAt: now });
    await dbm.db.insert(schema.product).values({ id: ids.product, organizationId: ids.org, name: "Acme", createdAt: now, updatedAt: now });
    await dbm.db.insert(schema.user).values({
      id: ids.user,
      name: "Writer",
      email: `${ids.user}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    if (!dbm) return;
    await dbm.db.delete(schema.organization).where(eq(schema.organization.id, ids.org));
    await dbm.db.delete(schema.user).where(eq(schema.user.id, ids.user));
    await dbm.pool.end();
  });

  const slug = `acme-${crypto.randomUUID().slice(0, 8)}`;

  it("validates and saves help center settings", async () => {
    expect(await actions.saveHelpCenterSettings(ids.product, { enabled: true, slug: "API", title: "Help", description: "" })).toMatchObject({
      ok: false,
    });
    ok(await actions.saveHelpCenterSettings(ids.product, { enabled: true, slug, title: "Acme Help", description: "Answers" }));
    expect(await service.getPublicHelpCenter(slug)).toMatchObject({ productId: ids.product, title: "Acme Help", productName: "Acme" });
  });

  let articleId = "";

  it("creates, edits with history, publishes and mirrors articles into the knowledge base", async () => {
    const categoryId = ok<string>(await actions.saveCategory(ids.product, { name: "Account & Billing" }));
    const category = await dbm.db.query.articleCategory.findFirst({ where: eq(schema.articleCategory.id, categoryId) });
    expect(category?.slug).toBe("account-billing");

    articleId = ok<string>(await actions.createArticle(ids.product, { title: "Reset your password" }));
    const second = ok<string>(await actions.createArticle(ids.product, { title: "Reset your password" }));
    const secondRow = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, second) });
    expect(secondRow?.slug).toBe("reset-your-password-2");

    // Publishing an empty article is refused.
    expect(await actions.setArticleStatus(articleId, "published")).toMatchObject({ ok: false });

    const body = "## Steps\n\n1. Open **Settings**\n2. Choose *Security* and click Reset.\n\nResetting signs you out everywhere.";
    expect(await actions.saveArticle(articleId, { title: "Reset your password", slug: "reset-your-password-2", summary: "", bodyMd: body, categoryId })).toMatchObject({
      ok: false,
      error: "Another article already uses that URL",
    });
    ok(await actions.saveArticle(articleId, { title: "Reset your password", slug: "reset-password", summary: "How to reset it", bodyMd: body, categoryId }));
    ok(await actions.saveArticle(articleId, { title: "Reset your password", slug: "reset-password", summary: "How to reset it", bodyMd: `${body}\n\nEdited.`, categoryId }));
    const versions = await dbm.db.query.articleVersion.findMany({ where: eq(schema.articleVersion.articleId, articleId) });
    // The empty draft isn't kept; the first real content is snapshotted before the edit.
    expect(versions).toHaveLength(1);
    expect(versions[0].bodyMd).toBe(body);

    enqueued.length = 0;
    ok(await actions.setArticleStatus(articleId, "published"));
    const mirrored = await source(articleId);
    expect(mirrored).toMatchObject({ type: "article", name: "Reset your password", status: "indexing" });
    expect(mirrored?.url).toMatch(new RegExp(`/help/${slug}/reset-password$`));
    expect(mirrored?.content).toContain("# Reset your password\n\nHow to reset it\n\n## Steps");
    expect(enqueued.some((job) => job.payload.sourceId === mirrored?.id)).toBe(true);

    // Editing a published article re-indexes the same source.
    enqueued.length = 0;
    ok(await actions.saveArticle(articleId, { title: "Reset your password", slug: "reset-password", summary: "How to reset it", bodyMd: `${body}\n\nUpdated.`, categoryId }));
    const updated = await source(articleId);
    expect(updated?.id).toBe(mirrored?.id);
    expect(updated?.revision).toBeGreaterThan(mirrored!.revision);
    expect(enqueued).toHaveLength(1);
  });

  it("searches published articles with stemming and title prefixes", async () => {
    const byStem = await service.searchArticles(ids.product, "resetting passwords");
    expect(byStem.map((a) => a.slug)).toContain("reset-password");
    const byPrefix = await service.searchArticles(ids.product, "passw");
    expect(byPrefix[0]?.slug).toBe("reset-password");
    // Drafts are never returned.
    expect((await service.searchArticles(ids.product, "reset")).map((a) => a.slug)).not.toContain("reset-your-password-2");
  });

  it("counts feedback only for published articles", async () => {
    const post = (body: unknown) =>
      feedback.POST(new NextRequest("http://localhost:3000/api/help/feedback", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    expect((await post({ articleId, helpful: true })).status).toBe(200);
    expect((await post({ articleId, helpful: "yes" })).status).toBe(400);
    expect((await post({ articleId: "missing", helpful: true })).status).toBe(404);
    const row = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, articleId) });
    expect(row?.helpfulCount).toBe(1);
  });

  it("suggests popular articles in the widget config", async () => {
    const res = await widgetConfig.GET(new NextRequest(`http://localhost:3000/api/widget/config?productId=${ids.product}`));
    const body = (await res.json()) as { helpCenter: { url: string; articles: { title: string; url: string }[] } | null };
    expect(body.helpCenter?.url).toMatch(new RegExp(`/help/${slug}$`));
    expect(body.helpCenter?.articles).toEqual([{ title: "Reset your password", url: expect.stringMatching(/\/reset-password$/) }]);
  });

  it("updates citation URLs when the help center is turned off, and removes unpublished articles", async () => {
    ok(await actions.saveHelpCenterSettings(ids.product, { enabled: false, slug, title: "Acme Help", description: "" }));
    expect((await source(articleId))?.url).toBeNull();
    expect(await service.getPublicHelpCenter(slug)).toBeNull();

    const sourceId = (await source(articleId))!.id;
    ok(await actions.setArticleStatus(articleId, "draft"));
    expect(await dbm.db.query.knowledgeSource.findFirst({ where: eq(schema.knowledgeSource.id, sourceId) })).toBeUndefined();
  });

  it("restores versions and imports documents as drafts", async () => {
    const [version] = await dbm.db.query.articleVersion.findMany({ where: eq(schema.articleVersion.articleId, articleId) });
    ok(await actions.restoreArticleVersion(articleId, version.id));
    const restored = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, articleId) });
    expect(restored?.bodyMd).toBe(version.bodyMd);

    const form = new FormData();
    const pdf = readFileSync(join(__dirname, "../../knowledge/__tests__/fixtures/refund-policy.pdf"));
    form.set("file", new File([pdf], "refund-policy.pdf", { type: "application/pdf" }));
    const importedId = ok<string>(await actions.importArticleFromFile(ids.product, form));
    const imported = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, importedId) });
    expect(imported).toMatchObject({ title: "refund policy", status: "draft" });
    expect(imported?.bodyMd).toContain("refunds within 30 days");

    const bad = new FormData();
    bad.set("file", new File(["MZ"], "tool.exe"));
    expect(await actions.importArticleFromFile(ids.product, bad)).toMatchObject({ ok: false, error: expect.stringContaining("Unsupported") });

    ok(await actions.deleteArticle(importedId));
    expect(await dbm.db.query.article.findFirst({ where: eq(schema.article.id, importedId) })).toBeUndefined();
  });
});
