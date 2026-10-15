import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { conversation, customer, member, message, productMember, user } from "@/db/schema";
import { publishToProductInbox } from "@/lib/ably";
import { appUrl, sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { registerJobHandler } from "@/lib/jobs/queue";
import { geminiGenerate } from "@/lib/knowledge/ai";

import { HANDOFF_REASON_LABELS } from "./policy";
import { HANDOFF_JOB_TYPES } from "./service";

function conversationIdFrom(payload: Record<string, unknown>): string {
  const id = payload.conversationId;
  if (typeof id !== "string" || !id) throw new Error("payload.conversationId is required");
  return id;
}

const SPEAKER: Record<string, string> = { customer: "Customer", ai: "AI assistant", agent: "Support agent" };

async function loadTranscript(conversationId: string, limit = 40) {
  const rows = await db.query.message.findMany({
    where: and(eq(message.conversationId, conversationId), inArray(message.senderType, ["customer", "ai", "agent"])),
    orderBy: [desc(message.seq)],
    limit,
  });
  return rows.reverse();
}

// ── AI summary for the agent picking up the conversation ───────────────────
registerJobHandler(HANDOFF_JOB_TYPES.summarize, async (payload) => {
  const conversationId = conversationIdFrom(payload);
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    with: { product: { columns: { organizationId: true } } },
  });
  if (!conv) return;

  const transcript = await loadTranscript(conversationId);
  if (transcript.length === 0) return;

  const summary = (
    await geminiGenerate(
      transcript.map((m) => `${SPEAKER[m.senderType] ?? m.senderType}: ${m.body}`).join("\n"),
      [
        "You write handoff notes for customer support agents.",
        "Summarize the conversation in at most 3 short lines:",
        "1) what the customer needs, 2) what was already tried or answered, 3) urgency or mood if notable.",
        "Plain text, no preamble, no markdown headings. Write in English.",
      ].join("\n"),
    )
  )
    .trim()
    .slice(0, 1200);
  if (!summary) return;

  await db.update(conversation).set({ aiSummary: summary }).where(eq(conversation.id, conversationId));
  await publishToProductInbox(conv.product.organizationId, conv.productId, "conversation_updated", {
    conversationId,
    aiSummary: summary,
  }).catch(() => {});
});

// ── Email the team when a customer is waiting and nobody is online ─────────
async function inboxRecipients(productId: string, organizationId: string): Promise<string[]> {
  const assigned = await db
    .select({ email: user.email })
    .from(productMember)
    .innerJoin(user, eq(user.id, productMember.userId))
    .where(eq(productMember.productId, productId));
  const owners = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), or(eq(member.role, "owner"), eq(member.role, "admin"))));
  return [...new Set([...assigned, ...owners].map((r) => r.email).filter(Boolean))].slice(0, 50);
}

registerJobHandler(HANDOFF_JOB_TYPES.notifyAgents, async (payload) => {
  const conversationId = conversationIdFrom(payload);
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    with: {
      product: { columns: { id: true, name: true, organizationId: true } },
      customer: { columns: { name: true, email: true } },
    },
  });
  // Someone already picked it up.
  if (!conv || conv.escalationStatus !== "pending" || conv.assigneeId) return;

  const recipients = await inboxRecipients(conv.productId, conv.product.organizationId);
  if (recipients.length === 0) return;

  const lastCustomerMessage = await db.query.message.findFirst({
    where: and(eq(message.conversationId, conversationId), eq(message.senderType, "customer")),
    orderBy: [desc(message.seq)],
  });
  const link = appUrl(`/products/${conv.productId}/inbox?conversation=${conversationId}`);
  const reason = HANDOFF_REASON_LABELS[conv.handoffReason ?? ""] ?? "Customer needs help";
  const reminder = payload.reminder === true;

  await sendEmail({
    to: recipients,
    subject: `${reminder ? "Still waiting" : "Customer waiting"}: ${conv.customer.name} — ${conv.product.name}`,
    html: `
      <p><strong>${escapeHtml(conv.customer.name)}</strong>${conv.customer.email ? ` (${escapeHtml(conv.customer.email)})` : ""} is waiting for a person in <strong>${escapeHtml(conv.product.name)}</strong>.</p>
      <p style="color:#737373;font-size:13px">${escapeHtml(reason)}${reminder ? " · no one has joined yet" : ""}</p>
      ${conv.aiSummary ? `<p style="white-space:pre-wrap;border-left:3px solid #e4e4e7;padding-left:10px">${escapeHtml(conv.aiSummary)}</p>` : ""}
      ${lastCustomerMessage ? `<p><em>“${escapeHtml(lastCustomerMessage.body.slice(0, 500))}”</em></p>` : ""}
      <p><a href="${escapeHtml(link)}" style="color:#000;font-weight:600">Open the conversation</a></p>
    `,
  });
});

// ── Email the customer when an agent replies after they left ──────────────
registerJobHandler(HANDOFF_JOB_TYPES.notifyCustomer, async (payload) => {
  const conversationId = conversationIdFrom(payload);
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, conversationId),
    with: { product: { columns: { name: true } } },
  });
  if (!conv) return;
  const cust = await db.query.customer.findFirst({
    where: eq(customer.id, conv.customerId),
    columns: { name: true, email: true },
  });
  const to = conv.followUpEmail ?? cust?.email;
  if (!to) return;

  // The customer is back in the widget; they will see the reply there.
  if (conv.customerLastSeenAt && Date.now() - conv.customerLastSeenAt.getTime() < 2 * 60 * 1000) return;

  const replies = await db
    .select({ body: message.body, senderName: user.name, createdAt: message.createdAt })
    .from(message)
    .leftJoin(user, eq(user.id, message.senderId))
    .where(
      and(
        eq(message.conversationId, conversationId),
        eq(message.senderType, "agent"),
        conv.customerNotifiedAt ? gt(message.createdAt, conv.customerNotifiedAt) : undefined,
      ),
    )
    .orderBy(asc(message.seq))
    .limit(10);
  if (replies.length === 0) return;

  await sendEmail({
    to,
    subject: `New reply from ${conv.product.name} support`,
    html: `
      <p>Hi ${escapeHtml(cust?.name ?? "there")},</p>
      <p>The ${escapeHtml(conv.product.name)} team replied to your conversation${conv.subject ? ` about “${escapeHtml(conv.subject)}”` : ""}:</p>
      ${replies
        .map(
          (r) =>
            `<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:#f4f4f5"><div style="font-size:12px;color:#71717a">${escapeHtml(r.senderName ?? "Support")}</div><div style="white-space:pre-wrap">${escapeHtml(r.body)}</div></div>`,
        )
        .join("")}
      <p style="color:#737373;font-size:13px">Open the chat on our website to continue the conversation.</p>
    `,
  });

  await db.update(conversation).set({ customerNotifiedAt: new Date() }).where(eq(conversation.id, conversationId));
});

export { HANDOFF_JOB_TYPES } from "./service";
