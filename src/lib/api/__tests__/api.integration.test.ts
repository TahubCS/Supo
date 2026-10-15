// REST API v1 (auth, scopes, conversations, messages, customers, knowledge,
// articles) and webhook delivery against Postgres. Ably, the job runner and
// outbound HTTP are stubbed. Runs only when TEST_DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;

const published: { event: string; data: Record<string, unknown> }[] = [];
const enqueued: { type: string; payload: Record<string, unknown> }[] = [];
const posts: { url: string; body: string; headers: Record<string, string> }[] = [];
let nextResponseStatus = 200;

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/ably", () => ({
  publishToConversation: async (_o: string, _p: string, _c: string, event: string, data: Record<string, unknown>) => {
    published.push({ event, data });
  },
  publishToProductInbox: async (_o: string, _p: string, event: string, data: Record<string, unknown>) => {
    published.push({ event, data });
  },
  getOnlineAgentCount: async () => 0,
  getOnlineAgentUserIds: async () => [],
}));
vi.mock("@/lib/jobs/queue", () => ({
  drainSoon: () => {},
  registerJobHandler: () => {},
  registerSweeper: () => {},
  enqueueAndKick: async (type: string, payload: Record<string, unknown>) => {
    enqueued.push({ type, payload });
    return "job";
  },
}));
vi.mock("@/lib/net/safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net/safe-fetch")>();
  return {
    ...actual,
    safePost: async (url: string, { body, headers }: { body: string; headers: Record<string, string> }) => {
      posts.push({ url, body, headers });
      return { status: nextResponseStatus, body: "ok", durationMs: 3 };
    },
  };
});

describe.skipIf(!DATABASE_URL)("REST API and webhooks (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const otherProductId = `prod_${crypto.randomUUID()}`;
  let dbm: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let keys: typeof import("@/lib/api/keys");
  let webhooks: typeof import("@/lib/webhooks/service");
  let sign: typeof import("@/lib/webhooks/sign");
  let routes: {
    conversations: typeof import("@/app/api/v1/conversations/route");
    conversation: typeof import("@/app/api/v1/conversations/[conversationId]/route");
    messages: typeof import("@/app/api/v1/conversations/[conversationId]/messages/route");
    customers: typeof import("@/app/api/v1/customers/route");
    customer: typeof import("@/app/api/v1/customers/[customerId]/route");
    sources: typeof import("@/app/api/v1/knowledge/sources/route");
    source: typeof import("@/app/api/v1/knowledge/sources/[sourceId]/route");
    reindex: typeof import("@/app/api/v1/knowledge/sources/[sourceId]/reindex/route");
    articles: typeof import("@/app/api/v1/articles/route");
  };
  let eq: typeof import("drizzle-orm").eq;

  const fullKey = { value: "" };
  const readOnlyKey = { value: "" };
  const otherKey = { value: "" };
  let customerId = "";
  let endpointId = "";
  const conversationIds: string[] = [];

  async function makeKey(product: string, scopes: string[], extra: Record<string, unknown> = {}) {
    const { key, prefix, hash } = keys.generateApiKey();
    await dbm.db.insert(schema.apiKey).values({
      id: crypto.randomUUID(),
      productId: product,
      name: "Test key",
      prefix,
      keyHash: hash,
      scopes,
      createdAt: new Date(),
      ...extra,
    });
    return key;
  }

  const req = (key: string, url: string, init: RequestInit & { json?: unknown } = {}) =>
    new Request(`http://localhost:3000${url}`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

  beforeAll(async () => {
    [dbm, schema, keys, webhooks, sign, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/api/keys"),
      import("@/lib/webhooks/service"),
      import("@/lib/webhooks/sign"),
      import("drizzle-orm"),
    ]);
    routes = {
      conversations: await import("@/app/api/v1/conversations/route"),
      conversation: await import("@/app/api/v1/conversations/[conversationId]/route"),
      messages: await import("@/app/api/v1/conversations/[conversationId]/messages/route"),
      customers: await import("@/app/api/v1/customers/route"),
      customer: await import("@/app/api/v1/customers/[customerId]/route"),
      sources: await import("@/app/api/v1/knowledge/sources/route"),
      source: await import("@/app/api/v1/knowledge/sources/[sourceId]/route"),
      reindex: await import("@/app/api/v1/knowledge/sources/[sourceId]/reindex/route"),
      articles: await import("@/app/api/v1/articles/route"),
    };
    const now = new Date();
    await dbm.db.insert(schema.organization).values({ id: orgId, name: "Org", createdAt: now });
    await dbm.db.insert(schema.product).values([
      { id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now },
      { id: otherProductId, organizationId: orgId, name: "Other", createdAt: now, updatedAt: now },
    ]);
    fullKey.value = await makeKey(productId, [...keys.API_SCOPES]);
    readOnlyKey.value = await makeKey(productId, ["conversations:read"]);
    otherKey.value = await makeKey(otherProductId, [...keys.API_SCOPES]);

    customerId = crypto.randomUUID();
    await dbm.db.insert(schema.customer).values({ id: customerId, organizationId: orgId, name: "Jane", email: "jane@example.com", createdAt: now, updatedAt: now });
    for (let i = 0; i < 3; i++) {
      const id = `conv_${crypto.randomUUID()}`;
      conversationIds.push(id);
      await dbm.db.insert(schema.conversation).values({
        id,
        productId,
        customerId,
        publicAccessToken: crypto.randomUUID().replaceAll("-", ""),
        subject: `Question ${i}`,
        lastMessageAt: new Date(now.getTime() - i * 60_000),
        createdAt: now,
        updatedAt: now,
      });
    }
    endpointId = crypto.randomUUID();
    await dbm.db.insert(schema.webhookEndpoint).values({
      id: endpointId,
      productId,
      url: "https://hooks.example.com/supo",
      secret: "whsec_test_secret",
      events: ["conversation.resolved", "message.created", "article.published"],
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeEach(() => {
    published.length = 0;
    enqueued.length = 0;
    posts.length = 0;
    nextResponseStatus = 200;
  });

  afterAll(async () => {
    if (!dbm) return;
    await dbm.db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await dbm.pool.end();
  });

  it("rejects missing, unknown, revoked, expired and under-scoped keys", async () => {
    const noKey = await routes.conversations.GET(new Request("http://localhost:3000/api/v1/conversations"));
    expect(noKey.status).toBe(401);
    expect(noKey.headers.get("www-authenticate")).toContain("Bearer");
    expect((await routes.conversations.GET(req(keys.generateApiKey().key, "/api/v1/conversations"))).status).toBe(401);

    const revoked = await makeKey(productId, ["conversations:read"], { revokedAt: new Date() });
    expect((await routes.conversations.GET(req(revoked, "/api/v1/conversations"))).status).toBe(401);
    const expired = await makeKey(productId, ["conversations:read"], { expiresAt: new Date(Date.now() - 1000) });
    expect((await routes.conversations.GET(req(expired, "/api/v1/conversations"))).status).toBe(401);

    const forbidden = await routes.customers.GET(req(readOnlyKey.value, "/api/v1/customers"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "insufficient_scope" } });
  });

  it("lists conversations with cursor pagination and isolates products", async () => {
    const first = await routes.conversations.GET(req(readOnlyKey.value, "/api/v1/conversations?limit=2"));
    const page1 = (await first.json()) as { data: { id: string; customer: { email: string } }[]; nextCursor: string };
    expect(page1.data.map((c) => c.id)).toEqual(conversationIds.slice(0, 2));
    expect(page1.data[0].customer.email).toBe("jane@example.com");
    const second = await routes.conversations.GET(req(readOnlyKey.value, `/api/v1/conversations?limit=2&cursor=${page1.nextCursor}`));
    const page2 = (await second.json()) as { data: { id: string }[]; nextCursor: string | null };
    expect(page2.data.map((c) => c.id)).toEqual([conversationIds[2]]);
    expect(page2.nextCursor).toBeNull();

    expect((await routes.conversations.GET(req(readOnlyKey.value, "/api/v1/conversations?cursor=garbage"))).status).toBe(400);
    expect((await routes.conversations.GET(req(readOnlyKey.value, "/api/v1/conversations?status=bogus"))).status).toBe(400);
    // Another product's key can't see these conversations.
    expect((await routes.conversation.GET(req(otherKey.value, "/x"), p({ conversationId: conversationIds[0] }))).status).toBe(404);
    const otherList = (await (await routes.conversations.GET(req(otherKey.value, "/api/v1/conversations"))).json()) as { data: unknown[] };
    expect(otherList.data).toHaveLength(0);
  });

  it("posts replies and notes, updates fields and resolves with webhooks", async () => {
    const id = conversationIds[0];
    const reply = await routes.messages.POST(req(fullKey.value, "/x", { method: "POST", json: { body: "We're on it!" } }), p({ conversationId: id }));
    expect(reply.status).toBe(201);
    const conv = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, id) });
    expect(conv).toMatchObject({ escalationStatus: "active", aiHandled: false });
    expect(conv?.firstResponseAt).toBeTruthy();
    expect(published.some((e) => e.event === "message" && e.data.body === "We're on it!")).toBe(true);

    const note = await routes.messages.POST(req(fullKey.value, "/x", { method: "POST", json: { body: "VIP", type: "note" } }), p({ conversationId: id }));
    expect(note.status).toBe(201);
    // Notes never reach the customer's channel.
    expect(published.some((e) => e.event === "message" && e.data.body === "VIP")).toBe(false);
    expect((await routes.messages.POST(req(fullKey.value, "/x", { method: "POST", json: { body: "  " } }), p({ conversationId: id }))).status).toBe(400);
    expect((await routes.messages.POST(req(readOnlyKey.value, "/x", { method: "POST", json: { body: "hi" } }), p({ conversationId: id }))).status).toBe(403);

    const list = (await (await routes.messages.GET(req(readOnlyKey.value, "/x?notes=false"), p({ conversationId: id }))).json()) as {
      data: { senderType: string; body: string }[];
    };
    expect(list.data.map((m) => m.senderType)).toEqual(["agent"]);

    const patched = await routes.conversation.PATCH(
      req(fullKey.value, "/x", { method: "PATCH", json: { priority: "urgent", tags: ["Billing Issue", "billing issue"], status: "resolved" } }),
      p({ conversationId: id }),
    );
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { data: unknown }).data).toMatchObject({ priority: "urgent", tags: ["billing-issue"], status: "resolved" });
    expect((await routes.conversation.PATCH(req(fullKey.value, "/x", { method: "PATCH", json: { priority: "asap" } }), p({ conversationId: id }))).status).toBe(400);

    const deliveries = await dbm.db.query.webhookDelivery.findMany({ where: eq(schema.webhookDelivery.endpointId, endpointId) });
    expect(deliveries.map((d) => d.event).sort()).toEqual(["conversation.resolved", "message.created"]);
    const resolved = deliveries.find((d) => d.event === "conversation.resolved")!;
    expect(resolved.payload).toMatchObject({ type: "conversation.resolved", productId, data: { conversation: { id, status: "resolved" } } });
    expect(enqueued.filter((j) => j.type === "webhook.deliver")).toHaveLength(2);
  });

  it("upserts customers by externalId or email", async () => {
    const created = await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", json: { externalId: "u_1", email: "SAM@example.com", name: "Sam" } }));
    expect(created.status).toBe(201);
    const body = (await created.json()) as { data: { id: string; email: string } };
    expect(body.data.email).toBe("sam@example.com");
    const again = await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", json: { externalId: "u_1", name: "Samuel" } }));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: { id: string; name: string } }).data).toMatchObject({ id: body.data.id, name: "Samuel" });
    // Matching Jane by email adds her externalId.
    const jane = await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", json: { email: "jane@example.com", externalId: "u_2" } }));
    expect(((await jane.json()) as { data: { id: string } }).data.id).toBe(customerId);

    expect((await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", json: { name: "No id" } }))).status).toBe(400);
    expect((await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", json: { email: "nope" } }))).status).toBe(400);
    expect((await routes.customers.POST(req(fullKey.value, "/x", { method: "POST", body: "{" }))).status).toBe(400);
    const found = (await (await routes.customers.GET(req(fullKey.value, "/api/v1/customers?externalId=u_1"))).json()) as { data: { id: string }[] };
    expect(found.data.map((c) => c.id)).toEqual([body.data.id]);
    expect((await routes.customer.PATCH(req(fullKey.value, "/x", { method: "PATCH", json: { externalId: "u_1" } }), p({ customerId }))).status).toBe(400);
  });

  it("manages knowledge sources and articles", async () => {
    const created = await routes.sources.POST(req(fullKey.value, "/x", { method: "POST", json: { type: "article", name: "Refunds", content: "Refunds take 5 days." } }));
    expect(created.status).toBe(201);
    const source = ((await created.json()) as { data: { id: string; status: string } }).data;
    expect(source.status).toBe("indexing");
    expect(enqueued.some((j) => j.payload.sourceId === source.id)).toBe(true);
    expect((await routes.sources.POST(req(fullKey.value, "/x", { method: "POST", json: { type: "ftp", name: "x" } }))).status).toBe(400);
    expect((await routes.sources.POST(req(fullKey.value, "/x", { method: "POST", json: { type: "url", name: "x", url: "notaurl" } }))).status).toBe(400);
    expect((await routes.reindex.POST(req(fullKey.value, "/x", { method: "POST" }), p({ sourceId: source.id }))).status).toBe(202);
    expect((await routes.source.GET(req(otherKey.value, "/x"), p({ sourceId: source.id }))).status).toBe(404);
    expect((await routes.source.DELETE(req(fullKey.value, "/x", { method: "DELETE" }), p({ sourceId: source.id }))).status).toBe(204);
    expect((await routes.source.GET(req(fullKey.value, "/x"), p({ sourceId: source.id }))).status).toBe(404);

    const article = await routes.articles.POST(
      req(fullKey.value, "/x", { method: "POST", json: { title: "Refund policy", bodyMd: "## Refunds\n\nWithin 30 days.", status: "published" } }),
    );
    expect(article.status).toBe(201);
    const data = ((await article.json()) as { data: { id: string; status: string; slug: string } }).data;
    expect(data).toMatchObject({ status: "published", slug: "refund-policy" });
    const row = await dbm.db.query.article.findFirst({ where: eq(schema.article.id, data.id) });
    expect(row?.knowledgeSourceId).toBeTruthy();
    const deliveries = await dbm.db.query.webhookDelivery.findMany({ where: eq(schema.webhookDelivery.event, "article.published") });
    expect(deliveries.some((d) => (d.payload as { data: { article: { id: string } } }).data.article.id === data.id)).toBe(true);
  });

  it("signs deliveries, retries failures and pauses endpoints that keep failing", async () => {
    const deliveryId = await webhooks.sendTestWebhook(endpointId, productId);
    await webhooks.deliverWebhook(deliveryId, { isFinalAttempt: false });
    expect(posts).toHaveLength(1);
    const sent = posts[0];
    expect(sent.url).toBe("https://hooks.example.com/supo");
    expect(sent.headers["Supo-Event"]).toBe("ping");
    expect(sign.verifyWebhookSignature("whsec_test_secret", sent.body, sent.headers["Supo-Signature"])).toBe(true);
    expect(await dbm.db.query.webhookDelivery.findFirst({ where: eq(schema.webhookDelivery.id, deliveryId) })).toMatchObject({
      status: "success",
      attempts: 1,
      responseStatus: 200,
    });

    nextResponseStatus = 500;
    const failing = await webhooks.sendTestWebhook(endpointId, productId);
    await expect(webhooks.deliverWebhook(failing, { isFinalAttempt: false })).rejects.toThrow("HTTP 500");
    expect(await dbm.db.query.webhookDelivery.findFirst({ where: eq(schema.webhookDelivery.id, failing) })).toMatchObject({ status: "pending", attempts: 1 });

    await dbm.db.update(schema.webhookEndpoint).set({ consecutiveFailures: webhooks.DISABLE_AFTER_FAILURES - 1 }).where(eq(schema.webhookEndpoint.id, endpointId));
    await expect(webhooks.deliverWebhook(failing, { isFinalAttempt: true })).rejects.toThrow();
    expect(await dbm.db.query.webhookDelivery.findFirst({ where: eq(schema.webhookDelivery.id, failing) })).toMatchObject({ status: "failed", attempts: 2 });
    const endpoint = await dbm.db.query.webhookEndpoint.findFirst({ where: eq(schema.webhookEndpoint.id, endpointId) });
    expect(endpoint).toMatchObject({ enabled: false });
    expect(endpoint?.disabledReason).toContain("15 failed deliveries");

    // Disabled endpoints get no new deliveries.
    await webhooks.emitWebhookEvent(productId, "message.created", { message: { id: "m" } });
    const after = await dbm.db.query.webhookDelivery.findMany({ where: eq(schema.webhookDelivery.endpointId, endpointId) });
    expect(after.filter((d) => (d.payload as { data: { message?: { id: string } } }).data.message?.id === "m")).toHaveLength(0);
  });
});
