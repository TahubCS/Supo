import { and, asc, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { conversation, emailChannel, message, product, user } from "@/db/schema";
import { publishToProductInbox } from "@/lib/ably";
import { upsertCustomer } from "@/lib/api/customers";
import { getClient, sendThreadedEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { escalateConversation } from "@/lib/handoff/service";
import { enqueueAndKick } from "@/lib/jobs/queue";
import { extractDocument } from "@/lib/knowledge/extract";
import { createConversationPublicAccessToken } from "@/lib/widget-conversation-access";
import { emitConversationEvent, emitWebhookEvent, messageData } from "@/lib/webhooks/service";

import {
  inboundLocalPart,
  normalizeSubject,
  outboundMessageId,
  parseAddress,
  stripQuotedReply,
  textToHtml,
  threadConversationId,
} from "./parse";

export const EMAIL_JOB_TYPES = { inbound: "email.inbound", outbound: "email.outbound" } as const;
const MAX_BODY = 20_000;
const SUBJECT_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isEmailChannelConfigured(): boolean {
  return Boolean(env.INBOUND_EMAIL_DOMAIN);
}

export function inboundAddress(local: string): string | null {
  const domain = env.INBOUND_EMAIL_DOMAIN;
  return domain ? `${local}@${domain}` : null;
}

export function generateAddressLocal(productName: string): string {
  const base = productName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return `${base || "support"}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

/** Normalized inbound email, as fetched from the provider. */
export type InboundEmail = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  messageId: string;
  attachments: { filename: string | null }[];
};

export async function fetchInboundEmail(emailId: string): Promise<InboundEmail> {
  const { data, error } = await getClient().emails.receiving.get(emailId);
  if (error || !data) throw new Error(`Could not fetch email ${emailId}: ${error?.message ?? "not found"}`);
  return {
    id: data.id,
    from: data.from,
    to: data.to ?? [],
    cc: data.cc ?? [],
    subject: data.subject ?? "",
    text: data.text,
    html: data.html,
    headers: data.headers ?? {},
    messageId: data.message_id,
    attachments: data.attachments ?? [],
  };
}

function header(headers: Record<string, string>, name: string): string {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : "";
}

/** Out-of-office replies, bounces and list mail must not open conversations. */
export function isAutomatedEmail(email: Pick<InboundEmail, "headers" | "from">): boolean {
  const autoSubmitted = header(email.headers, "auto-submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(header(email.headers, "precedence").trim())) return true;
  if (header(email.headers, "x-autoreply") || header(email.headers, "x-autorespond")) return true;
  return /^(mailer-daemon|postmaster|no-?reply)@/i.test(parseAddress(email.from)?.email ?? "");
}

function messageIdsIn(value: string): string[] {
  return value.match(/<[^<>\s]+>/g) ?? [];
}

/**
 * Turns an inbound email into a customer message: threads it onto an existing
 * conversation (our Message-IDs, the customer's own earlier Message-IDs, then
 * subject + sender) or opens a new email conversation for the team.
 */
export async function ingestInboundEmail(email: InboundEmail): Promise<{ conversationId: string; created: boolean } | null> {
  const domain = env.INBOUND_EMAIL_DOMAIN;
  if (!domain) throw new Error("INBOUND_EMAIL_DOMAIN is not set");

  const locals = [...email.to, ...email.cc].map((address) => inboundLocalPart(address, domain)).filter((v): v is string => Boolean(v));
  if (locals.length === 0) return null;
  const channel = await db.query.emailChannel.findFirst({
    where: and(inArray(emailChannel.addressLocal, locals), eq(emailChannel.enabled, true)),
  });
  if (!channel) return null;
  const sender = parseAddress(email.from);
  if (!sender || sender.email.endsWith(`@${domain}`) || isAutomatedEmail(email)) return null;

  const foundProduct = await db.query.product.findFirst({ where: eq(product.id, channel.productId) });
  if (!foundProduct) return null;
  const productId = foundProduct.id;
  const orgId = foundProduct.organizationId;

  const raw = email.text?.trim() || (email.html ? extractDocument(email.html, "text/html").text : "");
  let body = stripQuotedReply(raw).slice(0, MAX_BODY);
  const attachmentNames = email.attachments.map((a) => a.filename).filter(Boolean);
  if (attachmentNames.length > 0) body += `\n\n[Attachments not imported: ${attachmentNames.join(", ")}]`;
  if (!body.trim()) body = "(empty email)";

  const { row: cust } = await upsertCustomer(orgId, { email: sender.email, ...(sender.name ? { name: sender.name } : {}) });

  // 1. Replies to our emails carry our Message-ID.
  let conv = null as typeof conversation.$inferSelect | null | undefined;
  const threadId = threadConversationId(email.headers);
  if (threadId) {
    conv = await db.query.conversation.findFirst({
      where: and(eq(conversation.id, threadId), eq(conversation.productId, productId)),
    });
  }
  // 2. Follow-ups to the customer's own earlier email.
  if (!conv) {
    const referenced = [...messageIdsIn(header(email.headers, "in-reply-to")), ...messageIdsIn(header(email.headers, "references"))];
    if (referenced.length > 0) {
      const [hit] = await db
        .select({ conversationId: message.conversationId })
        .from(message)
        .innerJoin(conversation, eq(conversation.id, message.conversationId))
        .where(and(eq(conversation.productId, productId), inArray(message.emailMessageId, referenced.slice(0, 50))))
        .limit(1);
      if (hit) conv = await db.query.conversation.findFirst({ where: eq(conversation.id, hit.conversationId) });
    }
  }
  // 3. Same sender and subject recently (some providers rewrite Message-IDs).
  const subject = normalizeSubject(email.subject) || "(no subject)";
  if (!conv) {
    conv = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.productId, productId),
        eq(conversation.customerId, cust.id),
        eq(conversation.channel, "email"),
        eq(conversation.subject, subject.slice(0, 200)),
        gt(conversation.lastMessageAt, new Date(Date.now() - SUBJECT_MATCH_WINDOW_MS)),
      ),
      orderBy: [desc(conversation.lastMessageAt)],
    });
  }

  // De-duplicate provider retries.
  if (conv && email.messageId) {
    const seen = await db.query.message.findFirst({
      where: and(eq(message.conversationId, conv.id), eq(message.emailMessageId, email.messageId)),
      columns: { id: true },
    });
    if (seen) return { conversationId: conv.id, created: false };
  }

  const now = new Date();
  let created = false;
  if (!conv) {
    const [inserted] = await db
      .insert(conversation)
      .values({
        id: crypto.randomUUID(),
        productId,
        customerId: cust.id,
        status: "open",
        aiHandled: false,
        channel: "email",
        subject: subject.slice(0, 200),
        publicAccessToken: createConversationPublicAccessToken(),
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    conv = inserted;
    created = true;
  } else if (conv.status !== "open") {
    await db
      .update(conversation)
      .set({ status: "open", snoozedUntil: null, resolvedAt: null, updatedAt: now })
      .where(eq(conversation.id, conv.id));
  }

  const messageId = crypto.randomUUID();
  const [saved] = await db
    .insert(message)
    .values({
      id: messageId,
      conversationId: conv.id,
      body,
      senderType: "customer",
      emailMessageId: email.messageId || null,
      createdAt: now,
    })
    .returning({ seq: message.seq });
  await db.update(conversation).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversation.id, conv.id));

  const event = { id: messageId, seq: saved?.seq, body, senderType: "customer", createdAt: now.toISOString() };
  if (created) await publishToProductInbox(orgId, productId, "new_conversation", { conversationId: conv.id }).catch(() => {});
  await publishToProductInbox(orgId, productId, "conversation_updated", {
    conversationId: conv.id,
    status: "open",
    lastMessageAt: event.createdAt,
    latestMessage: event,
  }).catch(() => {});
  if (created) await emitConversationEvent("conversation.created", conv.id);
  await emitWebhookEvent(productId, "message.created", messageData({ id: messageId, conversationId: conv.id, senderType: "customer", body, createdAt: now }));

  // Email always goes to the team (no AI auto-reply), with SLAs and routing.
  if (created || !conv.escalationStatus) {
    await escalateConversation({
      orgId,
      productId,
      conversationId: conv.id,
      reason: "email",
      subject,
      customerName: cust.name,
      customerEmail: cust.email,
    });
  }
  return { conversationId: conv.id, created };
}

/** Queues the email for an agent reply on an email conversation. */
export async function queueEmailReplyIfNeeded(conv: { channel: string }, messageId: string): Promise<void> {
  if (conv.channel !== "email" || !isEmailChannelConfigured()) return;
  await enqueueAndKick(EMAIL_JOB_TYPES.outbound, { messageId }, { dedupeKey: `${EMAIL_JOB_TYPES.outbound}:${messageId}`, maxAttempts: 5 });
}

/** Job: sends one agent reply by email, threaded under the customer's messages. */
export async function sendEmailReply(messageId: string): Promise<void> {
  const domain = env.INBOUND_EMAIL_DOMAIN;
  if (!domain) return;
  const row = await db.query.message.findFirst({ where: eq(message.id, messageId) });
  if (!row || row.senderType !== "agent" || row.emailMessageId) return;
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.id, row.conversationId),
    with: { customer: { columns: { email: true, name: true } }, product: { columns: { name: true } } },
  });
  if (!conv || conv.channel !== "email" || !conv.customer.email) return;
  const channel = await db.query.emailChannel.findFirst({ where: eq(emailChannel.productId, conv.productId) });
  if (!channel) return;
  const agent = row.senderId
    ? await db.query.user.findFirst({ where: eq(user.id, row.senderId), columns: { name: true } })
    : null;

  const thread = await db
    .select({ emailMessageId: message.emailMessageId, senderType: message.senderType })
    .from(message)
    .where(and(eq(message.conversationId, conv.id), isNotNull(message.emailMessageId)))
    .orderBy(asc(message.seq))
    .limit(50);
  const references = thread.map((m) => m.emailMessageId!).slice(-10);
  const lastInbound = [...thread].reverse().find((m) => m.senderType === "customer")?.emailMessageId;

  const ownId = outboundMessageId(conv.id, row.id, domain);
  const senderName = `${agent?.name ?? "Support"} (${channel.fromName || conv.product.name})`.replace(/["<>\r\n]/g, "");
  await sendThreadedEmail({
    from: `"${senderName}" <${channel.addressLocal}@${domain}>`,
    to: conv.customer.email,
    subject: `Re: ${conv.subject ?? "Your request"}`,
    text: row.body,
    html: textToHtml(row.body),
    headers: {
      "Message-ID": ownId,
      ...(lastInbound ? { "In-Reply-To": lastInbound } : {}),
      ...(references.length ? { References: references.join(" ") } : {}),
    },
  });
  await db.update(message).set({ emailMessageId: ownId }).where(eq(message.id, row.id));
}
