// SLA targets, the breach-warning sweeper, the CSAT ratings endpoint and the
// analytics summary against Postgres. Ably, email and the job queue are stubbed.
// Runs only when TEST_DATABASE_URL is set.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;

const published: { event: string; data: Record<string, unknown> }[] = [];
const emails: { to: string[]; subject: string }[] = [];
const sweepers = new Map<string, () => Promise<void>>();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
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
  enqueueAndKick: async () => "job",
  registerJobHandler: () => {},
  registerSweeper: (name: string, fn: () => Promise<void>) => sweepers.set(name, fn),
}));
vi.mock("@/lib/email", () => ({
  appUrl: (path = "") => `http://localhost:3000${path}`,
  defaultFromAddress: () => "Supo <test@example.com>",
  sendEmail: async ({ to, subject }: { to: string | string[]; subject: string }) => {
    emails.push({ to: Array.isArray(to) ? to : [to], subject });
  },
}));

vi.mock("@/lib/product-access", () => ({
  getProductAccess: async (productId: string) => ({ role: "admin", product: { id: productId, name: "Acme Inc" } }),
  canAccessProductCapability: () => true,
}));

describe.skipIf(!DATABASE_URL)("SLA, CSAT and analytics (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const agentId = `user_${crypto.randomUUID()}`;
  const customerId = `cust_${crypto.randomUUID()}`;
  let dbm: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let ratings: typeof import("@/app/api/widget/ratings/route");
  let poll: typeof import("@/app/api/messages/poll/route");
  let handoff: typeof import("@/lib/handoff/service");
  let analytics: typeof import("@/lib/analytics/service");
  let eq: typeof import("drizzle-orm").eq;

  async function createConversation(overrides: Partial<typeof import("@/db/schema").conversation.$inferInsert> = {}) {
    const now = new Date();
    const id = `conv_${crypto.randomUUID()}`;
    const token = crypto.randomUUID().replaceAll("-", "");
    await dbm.db.insert(schema.conversation).values({
      id,
      productId,
      customerId,
      publicAccessToken: token,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
    return { id, token };
  }

  async function rate(ref: { id: string; token: string }, body: Record<string, unknown>) {
    const res = await ratings.POST(
      new NextRequest("http://localhost:3000/api/widget/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, conversationId: ref.id, conversationToken: ref.token, ...body }),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function pollOnce(ref: { id: string; token: string }) {
    const url = `http://localhost:3000/api/messages/poll?productId=${productId}&conversationId=${ref.id}&conversationToken=${ref.token}&after=0`;
    return (await (await poll.GET(new NextRequest(url))).json()) as { ratingRequested: boolean };
  }

  beforeAll(async () => {
    [dbm, schema, ratings, poll, handoff, analytics, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/app/api/widget/ratings/route"),
      import("@/app/api/messages/poll/route"),
      import("@/lib/handoff/service"),
      import("@/lib/analytics/service"),
      import("drizzle-orm"),
    ]);
    await import("@/lib/sla/jobs");
    const now = new Date();
    await dbm.db.insert(schema.organization).values({ id: orgId, name: "Org", createdAt: now });
    await dbm.db.insert(schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
    await dbm.db.insert(schema.user).values({
      id: agentId,
      name: "Alex Agent",
      email: `${agentId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await dbm.db.insert(schema.productMember).values({
      id: crypto.randomUUID(),
      productId,
      userId: agentId,
      role: "agent",
      createdAt: now,
      updatedAt: now,
    });
    await dbm.db.insert(schema.customer).values({ id: customerId, organizationId: orgId, name: "Jane", email: "jane@example.com", createdAt: now, updatedAt: now });
    await dbm.db.insert(schema.slaPolicy).values({
      id: crypto.randomUUID(),
      productId,
      priority: "normal",
      firstResponseMinutes: 30,
      resolutionMinutes: 240,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    if (!dbm) return;
    await dbm.db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await dbm.db.delete(schema.user).where(eq(schema.user.id, agentId));
    await dbm.pool.end();
  });

  it("sets SLA due dates on escalation and publishes them to the inbox", async () => {
    const ref = await createConversation();
    await handoff.escalateConversation({
      orgId,
      productId,
      conversationId: ref.id,
      reason: "customer_request",
      subject: null,
      customerName: "Jane",
      customerEmail: "jane@example.com",
    });
    const row = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, ref.id) });
    expect(row?.escalatedAt).toBeTruthy();
    // Business hours are off: due dates are plain wall-clock offsets.
    expect(row!.firstResponseDueAt!.getTime() - row!.escalatedAt!.getTime()).toBe(30 * 60_000);
    expect(row!.resolutionDueAt!.getTime() - row!.escalatedAt!.getTime()).toBe(240 * 60_000);
    const update = published.find((p) => p.event === "conversation_updated" && p.data.conversationId === ref.id && p.data.firstResponseDueAt);
    expect(update?.data.firstResponseDueAt).toBe(row!.firstResponseDueAt!.toISOString());
  });

  it("warns the team once when a first response is about to breach", async () => {
    const soon = new Date(Date.now() + 5 * 60_000);
    const ref = await createConversation({
      escalationStatus: "pending",
      escalatedAt: new Date(Date.now() - 25 * 60_000),
      firstResponseDueAt: soon,
      subject: "Billing",
    });
    const later = await createConversation({
      escalationStatus: "pending",
      escalatedAt: new Date(),
      firstResponseDueAt: new Date(Date.now() + 60 * 60_000),
    });
    const sweep = sweepers.get("sla-warnings");
    expect(sweep).toBeTypeOf("function");
    emails.length = 0;
    await sweep!();
    await sweep!();
    const mine = emails.filter((e) => e.subject.includes("Acme"));
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain("SLA due soon");
    expect(mine[0].to).toContain(`${agentId}@example.com`);
    const warned = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, ref.id) });
    const notWarned = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, later.id) });
    expect(warned?.slaWarningSentAt).toBeTruthy();
    expect(notWarned?.slaWarningSentAt).toBeNull();
  });

  it("collects a CSAT rating for a resolved conversation and credits the resolving agent", async () => {
    const open = await createConversation();
    expect((await rate(open, { score: 5 })).status).toBe(409);
    expect((await pollOnce(open)).ratingRequested).toBe(false);

    const resolvedAt = new Date();
    const ref = await createConversation({ status: "resolved", resolvedAt, resolvedById: agentId });
    expect((await pollOnce(ref)).ratingRequested).toBe(true);
    expect((await rate(ref, { score: 0 })).status).toBe(400);
    expect((await rate(ref, { score: 4.5 })).status).toBe(400);
    expect((await rate({ ...ref, token: "wrong" }, { score: 5 })).status).toBe(404);

    const ok = await rate(ref, { score: 2, comment: "  Slow reply  " });
    expect(ok).toEqual({ status: 200, body: { ok: true, score: 2 } });
    // Changing your mind updates the same rating.
    expect((await rate(ref, { score: 4, comment: "Actually fine" })).status).toBe(200);
    const stored = await dbm.db.query.conversationRating.findMany({
      where: eq(schema.conversationRating.conversationId, ref.id),
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ score: 4, comment: "Actually fine", agentId, productId });
    expect((await pollOnce(ref)).ratingRequested).toBe(false);
    expect(published.some((p) => p.event === "conversation_updated" && p.data.conversationId === ref.id && p.data.rating)).toBe(true);

    const stale = await createConversation({
      status: "resolved",
      resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60_000),
    });
    expect((await rate(stale, { score: 5 })).status).toBe(409);
  });

  it("does not ask for ratings when CSAT is turned off", async () => {
    const now = new Date();
    await dbm.db
      .insert(schema.widgetConfig)
      .values({ id: crypto.randomUUID(), productId, csatEnabled: false, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: schema.widgetConfig.productId, set: { csatEnabled: false } });
    const ref = await createConversation({ status: "resolved", resolvedAt: now });
    expect((await pollOnce(ref)).ratingRequested).toBe(false);
    expect((await rate(ref, { score: 5 })).status).toBe(403);
    await dbm.db.update(schema.widgetConfig).set({ csatEnabled: true }).where(eq(schema.widgetConfig.productId, productId));
  });

  it("summarizes deflection, response times, SLA attainment and CSAT", async () => {
    const start = new Date(Date.now() - 60 * 60_000);
    const end = new Date(Date.now() + 60_000);
    const before = await analytics.getSummary(productId, start, end);

    const t0 = new Date(Date.now() - 30 * 60_000);
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    // AI-only conversation.
    const aiOnly = await createConversation({ createdAt: t0 });
    await dbm.db.insert(schema.message).values([
      { id: crypto.randomUUID(), conversationId: aiOnly.id, body: "How do I reset?", senderType: "customer", createdAt: at(0) },
      {
        id: crypto.randomUUID(),
        conversationId: aiOnly.id,
        body: "Like this.",
        senderType: "ai",
        sources: [{ title: "Reset guide", url: null }],
        createdAt: at(1),
      },
    ]);
    // Human-handled conversation answered within its SLA.
    const human = await createConversation({
      createdAt: t0,
      escalatedAt: at(2),
      firstResponseAt: at(6),
      firstResponseDueAt: at(32),
      status: "resolved",
      resolvedAt: at(20),
      resolvedById: agentId,
    });
    await dbm.db.insert(schema.message).values([
      { id: crypto.randomUUID(), conversationId: human.id, body: "Help", senderType: "customer", createdAt: at(0) },
      { id: crypto.randomUUID(), conversationId: human.id, body: "Not sure.", senderType: "ai", createdAt: at(1) },
      { id: crypto.randomUUID(), conversationId: human.id, body: "On it", senderType: "agent", senderId: agentId, createdAt: at(6) },
    ]);

    const after = await analytics.getSummary(productId, start, end);
    expect(after.conversations - before.conversations).toBe(2);
    expect(after.aiOnly - before.aiOnly).toBe(1);
    expect(after.aiAnswers - before.aiAnswers).toBe(2);
    expect(after.groundedAnswers - before.groundedAnswers).toBe(1);
    expect(after.slaMet - before.slaMet).toBe(1);
    expect(after.firstResponseP50).not.toBeNull();
    expect(after.csatResponses).toBeGreaterThanOrEqual(1);

    const agents = await analytics.getAgentMetrics(productId, start, end);
    const alex = agents.find((a) => a.agentId === agentId);
    expect(alex).toMatchObject({ name: "Alex Agent", replies: 1 });
    expect(alex!.resolved).toBeGreaterThanOrEqual(1);
    expect(alex!.firstResponseP50).toBe(240);

    const { GET: exportCsv } = await import("@/app/(app)/products/[id]/analytics/export/route");
    const res = await exportCsv(new NextRequest("http://localhost:3000/x?range=7"), {
      params: Promise.resolve({ id: productId }),
    });
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("supo-Acme_Inc-conversations-7d.csv");
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toMatch(/^conversation_id,created_at,/);
    const humanRow = lines.find((line) => line.startsWith(human.id))!;
    expect(humanRow).toContain(",met,");
    expect(humanRow).toContain("Alex Agent");
    expect(humanRow).toContain(at(6).toISOString());
    const aiRow = lines.find((line) => line.startsWith(aiOnly.id))!;
    expect(aiRow).toContain(",yes,2,");

    const window = await analytics.resolveWindow(productId, 7);
    const daily = await analytics.getDailyVolume(productId, window);
    expect(daily.length).toBeGreaterThanOrEqual(7);
    expect(daily.reduce((sum, d) => sum + d.conversations, 0)).toBeGreaterThanOrEqual(2);
  });
});
