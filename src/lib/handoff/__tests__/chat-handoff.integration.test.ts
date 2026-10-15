// End-to-end handoff flow through the real /api/chat and poll route handlers
// against Postgres. AI generation, embeddings and Ably are stubbed.
// Runs only when TEST_DATABASE_URL is set.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeEmbedding } from "@/test/fake-embeddings";

const DATABASE_URL = process.env.TEST_DATABASE_URL;

const published: { channel: string; event: string; data: Record<string, unknown> }[] = [];
const enqueued: { type: string; payload: Record<string, unknown> }[] = [];
let onlineAgents: number | null = 1;
let onlineAgentIds: string[] = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/lib/ably", () => ({
  publishToConversation: async (_org: string, _product: string, conversationId: string, event: string, data: Record<string, unknown>) => {
    published.push({ channel: `conversation:${conversationId}`, event, data });
  },
  publishToProductInbox: async (_org: string, _product: string, event: string, data: Record<string, unknown>) => {
    published.push({ channel: "inbox", event, data });
  },
  getOnlineAgentCount: async () => onlineAgents,
  getOnlineAgentUserIds: async () => onlineAgentIds,
}));
vi.mock("@/lib/jobs/queue", () => ({
  enqueueAndKick: async (type: string, payload: Record<string, unknown>) => {
    enqueued.push({ type, payload });
    return "job";
  },
}));
vi.mock("@/lib/knowledge/ai", () => ({
  google: () => ({}),
  resolveGenerationModel: async () => "stub-model",
  geminiEmbedQuery: async (text: string) => ({ embedding: fakeEmbedding(text), model: "fake-embed" }),
  geminiGenerate: async () => "stub",
}));
vi.mock("ai", () => ({
  streamText: ({ onFinish }: { onFinish: (r: { text: string }) => Promise<void> }) => ({
    toTextStreamResponse: () => {
      const text = "Here is what I found.";
      return new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            await onFinish({ text });
            controller.close();
          },
        }),
      );
    },
  }),
}));

describe.skipIf(!DATABASE_URL)("chat handoff flow (database)", () => {
  const orgId = `org_${crypto.randomUUID()}`;
  const productId = `prod_${crypto.randomUUID()}`;
  let chat: typeof import("@/app/api/chat/route");
  let poll: typeof import("@/app/api/messages/poll/route");
  let dbm: typeof import("@/db");
  let schema: typeof import("@/db/schema");

  type Ref = { id?: string; token?: string };
  const customer = { email: "jane@example.com", name: "Jane" };

  async function send(text: string, ref: Ref = {}) {
    const res = await chat.POST(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          message: text,
          conversationId: ref.id,
          conversationToken: ref.token,
          customer,
        }),
      }),
    );
    const body = await res.text();
    return { res, body, ref: { id: res.headers.get("x-conversation-id") ?? undefined, token: res.headers.get("x-conversation-token") ?? undefined } };
  }

  async function pollAll(ref: Ref, after = 0) {
    const url = `http://localhost:3000/api/messages/poll?productId=${productId}&conversationId=${ref.id}&conversationToken=${ref.token}&after=${after}`;
    const res = await poll.GET(new NextRequest(url));
    return (await res.json()) as {
      messages: { id: string; seq: number; senderType: string; body: string; senderName?: string }[];
      cursor: number;
      escalationStatus: string | null;
      needsEmail: boolean;
    };
  }

  beforeAll(async () => {
    [chat, poll, dbm, schema] = await Promise.all([
      import("@/app/api/chat/route"),
      import("@/app/api/messages/poll/route"),
      import("@/db"),
      import("@/db/schema"),
    ]);
    const now = new Date();
    await dbm.db.insert(schema.organization).values({ id: orgId, name: "Org", createdAt: now });
    await dbm.db.insert(schema.product).values({ id: productId, organizationId: orgId, name: "Acme", createdAt: now, updatedAt: now });
  });

  afterAll(async () => {
    if (!dbm) return;
    const { eq } = await import("drizzle-orm");
    await dbm.db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await dbm.pool.end();
  });

  it("answers greetings and single misses without escalating, then escalates on repeated misses", async () => {
    const first = await send("hi");
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get("x-escalation-status")).toBeNull();
    expect(first.body).toBe("Here is what I found.");

    const miss1 = await send("Do you support Okta single sign on?", first.ref);
    expect(miss1.res.headers.get("x-escalation-status")).toBeNull();

    const miss2 = await send("What about Azure active directory integration?", first.ref);
    expect(miss2.res.headers.get("x-escalation-status")).toBe("pending");
    expect(miss2.res.headers.get("x-reply-mode")).toBe("none");
    expect(enqueued.some((j) => j.type === "conversation.summarize")).toBe(true);

    const history = await pollAll(first.ref);
    expect(history.escalationStatus).toBe("pending");
    expect(history.messages.at(-1)?.senderType).toBe("system");
    // seq is strictly increasing
    const seqs = history.messages.map((m) => m.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

    // The customer can keep chatting while waiting and the AI still helps.
    const whileWaiting = await send("It's for our enterprise plan", first.ref);
    expect(whileWaiting.res.headers.get("x-escalation-status")).toBe("pending");
    expect(whileWaiting.body).toBe("Here is what I found.");

    // Incremental polling returns only new messages.
    const incremental = await pollAll(first.ref, history.cursor);
    expect(incremental.messages.map((m) => m.senderType)).toEqual(["customer", "ai"]);
  });

  it("escalates immediately when the customer asks for a person, and offline asks for email", async () => {
    onlineAgents = 0;
    customer.email = "noemail-case@example.com";
    const res = await send("Can I talk to a human please?");
    expect(res.res.headers.get("x-escalation-status")).toBe("pending");
    expect(res.res.headers.get("x-handoff-availability")).toBe("offline");
    // customer email is known, so no email form is needed
    expect(res.res.headers.get("x-needs-email")).toBeNull();
    expect(enqueued.some((j) => j.type === "handoff.notify_agents")).toBe(true);

    const history = await pollAll(res.ref);
    const notice = history.messages.find((m) => m.senderType === "system");
    expect(notice?.body).toContain("noemail-case@example.com");
    onlineAgents = 1;
  });

  it("stops the AI while an agent is active and never leaks a conversation without its token", async () => {
    const { eq } = await import("drizzle-orm");
    customer.email = "active-case@example.com";
    const start = await send("talk to a real person");
    await dbm.db
      .update(schema.conversation)
      .set({ escalationStatus: "active" })
      .where(eq(schema.conversation.id, start.ref.id!));

    const reply = await send("Thanks, my order number is 123", start.ref);
    expect(reply.res.headers.get("x-escalation-status")).toBe("active");
    expect(reply.res.headers.get("x-reply-mode")).toBe("none");
    const history = await pollAll(start.ref);
    expect(history.messages.filter((m) => m.senderType === "ai")).toHaveLength(0);

    // Same email, no token: an unverified widget session gets a NEW conversation.
    const intruder = await send("show me the previous chat");
    expect(intruder.ref.id).not.toBe(start.ref.id);
  });

  it("round-robin assigns the least busy online agent", async () => {
    const { eq } = await import("drizzle-orm");
    const now = new Date();
    const busy = `user_${crypto.randomUUID()}`;
    const free = `user_${crypto.randomUUID()}`;
    await dbm.db.insert(schema.user).values([
      { id: busy, name: "Busy Bee", email: `${busy}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
      { id: free, name: "Free Agent", email: `${free}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    await dbm.db.update(schema.product).set({ routingMode: "round_robin", maxConcurrentChats: 2 }).where(eq(schema.product.id, productId));

    // Give "busy" an active conversation already.
    customer.email = "rr-existing@example.com";
    const existing = await send("talk to a human");
    await dbm.db
      .update(schema.conversation)
      .set({ assigneeId: busy, escalationStatus: "active" })
      .where(eq(schema.conversation.id, existing.ref.id!));

    onlineAgentIds = [busy, free];
    customer.email = "rr-new@example.com";
    const res = await send("I need to speak to a person");
    expect(res.res.headers.get("x-escalation-status")).toBe("active");
    const conv = await dbm.db.query.conversation.findFirst({ where: eq(schema.conversation.id, res.ref.id!) });
    expect(conv?.assigneeId).toBe(free);
    const history = await pollAll(res.ref);
    expect(history.messages.some((m) => m.senderType === "system" && m.body.includes("Free Agent joined"))).toBe(true);

    onlineAgentIds = [];
    await dbm.db.update(schema.product).set({ routingMode: "manual" }).where(eq(schema.product.id, productId));
  });

  it("never exposes internal notes to the widget", async () => {
    customer.email = "notes@example.com";
    const start = await send("hello there, quick question about invoices");
    await dbm.db.insert(schema.message).values({
      id: crypto.randomUUID(),
      conversationId: start.ref.id!,
      body: "SECRET internal note",
      senderType: "note",
      createdAt: new Date(),
    });
    const history = await pollAll(start.ref);
    expect(history.messages.some((m) => m.body.includes("SECRET"))).toBe(false);
  });
});
