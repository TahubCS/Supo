// Email channel (signed inbound webhook, threading, outbound replies) and
// privacy tools (export, erase, retention) against Postgres. Resend, Ably and
// the job runner are stubbed. Runs only when TEST_DATABASE_URL is set.
import { createHmac } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const DOMAIN = "inbound.test";
const WEBHOOK_SECRET = `whsec_${Buffer.from("test-signing-secret-0123456789").toString("base64")}`;

const enqueued: { type: string; payload: Record<string, unknown> }[] = [];
const sent: { from: string; to: string; subject: string; text: string; headers: Record<string, string> }[] = [];
const inbox = new Map<string, Record<string, unknown>>();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/lib/ably", () => ({
  publishToConversation: async () => {},
  publishToProductInbox: async () => {},
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
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  const { Resend } = await import("resend");
  const real = new Resend("re_test_key");
  return {
    ...actual,
    appUrl: (path = "") => `http://localhost:3000${path}`,
    sendEmail: async () => "id",
    sendThreadedEmail: async (input: (typeof sent)[number]) => {
      sent.push(input);
      return "resend-id";
    },
    getClient: () => ({
      webhooks: real.webhooks,
      emails: {
        receiving: {
          get: async (id: string) => (inbox.has(id) ? { data: inbox.get(id), error: null } : { data: null, error: { message: "not found" } }),
        },
      },
    }),
  };
});

function svixHeaders(payload: string, secret = WEBHOOK_SECRET) {
  const id = `msg_${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` };
}

describe.skipIf(!DATABASE_URL)("email channel and privacy (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  const local = `acme-${crypto.randomUUID().slice(0, 8)}`;
  let dbm: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let email: typeof import("@/lib/email-channel/service");
  let privacy: typeof import("@/lib/privacy/service");
  let route: typeof import("@/app/api/inbound/email/route");
  let parse: typeof import("@/lib/email-channel/parse");
  let eq: typeof import("drizzle-orm").eq;

  const base = (overrides: Partial<import("@/lib/email-channel/service").InboundEmail> = {}) => ({
    id: crypto.randomUUID(),
    from: "Jane Customer <jane@customer.test>",
    to: [`Acme Support <${local}@${DOMAIN}>`],
    cc: [],
    subject: "Refund for order 42",
    text: "Hi, I'd like a refund.\n\nThanks",
    html: null,
    headers: {},
    messageId: `<${crypto.randomUUID()}@mail.customer.test>`,
    attachments: [],
    ...overrides,
  });

  beforeAll(async () => {
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN;
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    [dbm, schema, email, privacy, route, parse, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/email-channel/service"),
      import("@/lib/privacy/service"),
      import("@/app/api/inbound/email/route"),
      import("@/lib/email-channel/parse"),
      import("drizzle-orm"),
    ]);
    const now = new Date();
    await dbm.db.insert(schema.organization).values({ id: orgId, name: "Org", createdAt: now });
    await dbm.db.insert(schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
    await dbm.db.insert(schema.emailChannel).values({ productId, addressLocal: local, fromName: "Acme Help", createdAt: now, updatedAt: now });
  });

  beforeEach(() => {
    enqueued.length = 0;
    sent.length = 0;
  });

  afterAll(async () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    delete process.env.RESEND_WEBHOOK_SECRET;
    if (!dbm) return;
    await dbm.db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await dbm.pool.end();
  });

  it("verifies the Resend webhook signature and queues the email", async () => {
    const payload = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: "em_1" } });
    const post = (body: string, headers: Record<string, string>) =>
      route.POST(new Request("http://localhost:3000/api/inbound/email", { method: "POST", body, headers }));

    expect((await post(payload, svixHeaders(payload, `whsec_${Buffer.from("wrong").toString("base64")}`))).status).toBe(401);
    expect((await post(`${payload} `, svixHeaders(payload))).status).toBe(401);
    expect((await post(payload, svixHeaders(payload))).status).toBe(200);
    expect(enqueued).toEqual([{ type: "email.inbound", payload: { emailId: "em_1" } }]);

    const other = JSON.stringify({ type: "email.delivered", data: {} });
    expect(await (await post(other, svixHeaders(other))).json()).toMatchObject({ ignored: "email.delivered" });
  });

  let conversationId = "";
  let firstMessageId = "";

  it("opens an email conversation for the team and de-duplicates retries", async () => {
    const first = base();
    firstMessageId = first.messageId;
    const result = await email.ingestInboundEmail(first);
    expect(result?.created).toBe(true);
    conversationId = result!.conversationId;
    const conv = await dbm.db.query.conversation.findFirst({
      where: eq(schema.conversation.id, conversationId),
      with: { customer: true },
    });
    expect(conv).toMatchObject({ channel: "email", subject: "Refund for order 42", escalationStatus: "pending", aiHandled: false, handoffReason: "email" });
    expect(conv?.customer).toMatchObject({ email: "jane@customer.test", name: "Jane Customer" });

    expect((await email.ingestInboundEmail(first))?.created).toBe(false);
    const messages = await dbm.db.query.message.findMany({ where: eq(schema.message.conversationId, conversationId) });
    expect(messages.filter((m) => m.senderType === "customer")).toHaveLength(1);
  });

  it("emails agent replies in the thread and threads the customer's answer back", async () => {
    const replyId = crypto.randomUUID();
    await dbm.db.insert(schema.message).values({ id: replyId, conversationId, body: "Refund issued!", senderType: "agent", createdAt: new Date() });
    await email.sendEmailReply(replyId);
    expect(sent).toHaveLength(1);
    const out = sent[0];
    expect(out.from).toBe(`"Support (Acme Help)" <${local}@${DOMAIN}>`);
    expect(out.to).toBe("jane@customer.test");
    expect(out.subject).toBe("Re: Refund for order 42");
    expect(out.headers["In-Reply-To"]).toBe(firstMessageId);
    const ownId = parse.outboundMessageId(conversationId, replyId, DOMAIN);
    expect(out.headers["Message-ID"]).toBe(ownId);
    await email.sendEmailReply(replyId);
    expect(sent).toHaveLength(1); // already sent

    const answer = base({
      subject: "Re: Refund for order 42",
      text: `Thank you!\n\nOn Wed, Acme Support <${local}@${DOMAIN}> wrote:\n> Refund issued!`,
      headers: { "In-Reply-To": ownId, References: `${firstMessageId} ${ownId}` },
    });
    expect(await email.ingestInboundEmail(answer)).toEqual({ conversationId, created: false });
    const last = await dbm.db.query.message.findMany({ where: eq(schema.message.conversationId, conversationId) });
    expect(last.at(-1)?.body).toBe("Thank you!");

    // A follow-up that only references the customer's first email lands in the same conversation.
    const followUp = base({ subject: "Something else", headers: { References: firstMessageId } });
    expect((await email.ingestInboundEmail(followUp))?.conversationId).toBe(conversationId);
    // Same sender and subject without headers (rewritten Message-IDs) also threads.
    const plain = base({ subject: "RE: Refund for order 42" });
    expect((await email.ingestInboundEmail(plain))?.conversationId).toBe(conversationId);
  });

  it("ignores automated mail, unknown addresses and disabled channels", async () => {
    expect(await email.ingestInboundEmail(base({ headers: { "Auto-Submitted": "auto-replied" } }))).toBeNull();
    expect(await email.ingestInboundEmail(base({ from: "MAILER-DAEMON@customer.test" }))).toBeNull();
    expect(await email.ingestInboundEmail(base({ to: [`nobody@${DOMAIN}`] }))).toBeNull();
    expect(await email.ingestInboundEmail(base({ from: `loop@${DOMAIN}` }))).toBeNull();
    await dbm.db.update(schema.emailChannel).set({ enabled: false }).where(eq(schema.emailChannel.productId, productId));
    expect(await email.ingestInboundEmail(base({ subject: "New topic" }))).toBeNull();
    await dbm.db.update(schema.emailChannel).set({ enabled: true }).where(eq(schema.emailChannel.productId, productId));
  });

  it("exports and erases a customer, including webhook logs", async () => {
    const conv = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) });
    const customerId = conv!.customerId;
    const exported = await privacy.exportCustomerData(orgId, customerId);
    expect(exported?.customer.email).toBe("jane@customer.test");
    expect(exported?.conversations[0].messages.map((m) => m.body)).toContain("Refund issued!");
    expect(await privacy.exportCustomerData("other-org", customerId)).toBeNull();

    const endpointId = crypto.randomUUID();
    const now = new Date();
    await dbm.db.insert(schema.webhookEndpoint).values({ id: endpointId, productId, url: "https://h.test", secret: "s", events: [], createdAt: now, updatedAt: now });
    await dbm.db.insert(schema.webhookDelivery).values([
      { id: crypto.randomUUID(), endpointId, event: "message.created", payload: { data: { message: { conversationId } } }, createdAt: now },
      { id: crypto.randomUUID(), endpointId, event: "conversation.created", payload: { data: { conversation: { id: conversationId } } }, createdAt: now },
      { id: crypto.randomUUID(), endpointId, event: "ping", payload: { data: {} }, createdAt: now },
    ]);

    expect(await privacy.eraseCustomer(orgId, customerId)).toEqual({ conversations: 1 });
    expect(await dbm.db.query.customer.findFirst({ where: eq(schema.customer.id, customerId) })).toBeUndefined();
    expect(await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) })).toBeUndefined();
    const remaining = await dbm.db.query.webhookDelivery.findMany({ where: eq(schema.webhookDelivery.endpointId, endpointId) });
    expect(remaining.map((d) => d.event)).toEqual(["ping"]);
  });

  it("applies retention to old resolved conversations only", async () => {
    const day = 24 * 60 * 60 * 1000;
    const old = new Date(Date.now() - 40 * day);
    const mk = async (status: string, lastMessageAt: Date, customerId: string) => {
      const id = crypto.randomUUID();
      await dbm.db.insert(schema.conversation).values({
        id,
        productId,
        customerId,
        status,
        publicAccessToken: crypto.randomUUID(),
        lastMessageAt,
        createdAt: lastMessageAt,
        updatedAt: lastMessageAt,
      });
      return id;
    };
    const lonely = crypto.randomUUID();
    const busy = crypto.randomUUID();
    await dbm.db.insert(schema.customer).values([
      { id: lonely, organizationId: orgId, name: "Old", createdAt: old, updatedAt: old },
      { id: busy, organizationId: orgId, name: "Busy", createdAt: old, updatedAt: old },
    ]);
    const oldResolved = await mk("resolved", old, lonely);
    const oldOpen = await mk("open", old, busy);
    const recentResolved = await mk("resolved", new Date(), busy);

    await dbm.db.update(schema.product).set({ dataRetentionDays: 30 }).where(eq(schema.product.id, productId));
    const result = await privacy.applyRetention();
    expect(result.conversations).toBeGreaterThanOrEqual(1);
    const exists = async (id: string) => Boolean(await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, id) }));
    expect(await exists(oldResolved)).toBe(false);
    expect(await exists(oldOpen)).toBe(true);
    expect(await exists(recentResolved)).toBe(true);
    expect(await dbm.db.query.customer.findFirst({ where: eq(schema.customer.id, lonely) })).toBeUndefined();
    expect(await dbm.db.query.customer.findFirst({ where: eq(schema.customer.id, busy) })).toBeTruthy();
  });
});
