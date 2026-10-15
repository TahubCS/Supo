import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { conversation, conversationRating } from "@/db/schema";
import { isRealtimeConfigured } from "@/lib/ably";
import { drainSoon } from "@/lib/jobs/queue";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

import { listTeammates } from "./actions";
import { InboxView } from "./InboxView";
import type { ConversationWithDetails } from "./types";

const INBOX_PAGE_SIZE = 150;

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { id } = await params;
  const { conversation: requestedConversationId } = await searchParams;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "inbox")) notFound();

  // Wake snoozed conversations whose snooze has expired.
  await db
    .update(conversation)
    .set({ status: "open", snoozedUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(conversation.productId, id),
        eq(conversation.status, "snoozed"),
        lte(conversation.snoozedUntil, new Date()),
      ),
    );

  // Keep background jobs and SLA warnings moving while agents work.
  drainSoon();

  const conversations = await db.query.conversation.findMany({
    where:
      access.role === "agent"
        ? and(
            eq(conversation.productId, id),
            or(
              eq(conversation.assigneeId, access.session.user.id),
              and(eq(conversation.escalationStatus, "pending"), isNull(conversation.assigneeId)),
            ),
          )
        : and(
            eq(conversation.productId, id),
            // Always include everything waiting for a human, plus recent history.
            or(ne(conversation.status, "resolved"), sql`${conversation.lastMessageAt} > now() - interval '30 days'`),
          ),
    with: { customer: { columns: { id: true, name: true, email: true } } },
    orderBy: [desc(conversation.lastMessageAt)],
    limit: INBOX_PAGE_SIZE,
  });

  // Latest message per conversation in one query (was one query per row).
  const ids = conversations.map((c) => c.id);
  const latestRows = ids.length
    ? await db.execute(sql`
        SELECT DISTINCT ON (conversation_id) id, conversation_id, body, sender_type, created_at
          FROM message
         WHERE conversation_id IN (${sql.join(ids.map((cid) => sql`${cid}`), sql`, `)})
           AND sender_type <> 'note'
         ORDER BY conversation_id, seq DESC`)
    : { rows: [] };
  const latestByConversation = new Map(
    (latestRows.rows as { id: string; conversation_id: string; body: string; sender_type: string; created_at: string | Date }[]).map(
      (row) => [
        row.conversation_id,
        { id: row.id, body: row.body, senderType: row.sender_type, createdAt: new Date(row.created_at) },
      ],
    ),
  );

  const ratings = ids.length
    ? await db
        .select({
          conversationId: conversationRating.conversationId,
          score: conversationRating.score,
          comment: conversationRating.comment,
        })
        .from(conversationRating)
        .where(inArray(conversationRating.conversationId, ids))
    : [];
  const ratingByConversation = new Map(ratings.map((r) => [r.conversationId, { score: r.score, comment: r.comment }]));

  const withMessages: ConversationWithDetails[] = conversations.map((conv) => ({
    ...conv,
    latestMessage: latestByConversation.get(conv.id) ?? null,
    rating: ratingByConversation.get(conv.id) ?? null,
  }));

  const teammates = await listTeammates(id);
  const initialSelectedId =
    requestedConversationId && withMessages.some((c) => c.id === requestedConversationId)
      ? requestedConversationId
      : null;

  return (
    <InboxView
      conversations={withMessages}
      productId={id}
      orgId={access.product.organizationId}
      userName={access.session.user.name}
      currentUserId={access.session.user.id}
      productRole={access.role}
      teammates={teammates}
      initialSelectedId={initialSelectedId}
      realtimeEnabled={isRealtimeConfigured()}
    />
  );
}
