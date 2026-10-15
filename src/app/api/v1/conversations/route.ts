import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { conversation } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { serializeConversation } from "@/lib/api/conversations";
import { badRequest, decodeCursor, encodeCursor, handleApiErrors, parseLimit } from "@/lib/api/http";

const STATUSES = ["open", "resolved", "snoozed"];
const ESCALATIONS = ["pending", "active"];

/** GET /api/v1/conversations?status=&escalation=&limit=&cursor= (newest activity first) */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "conversations:read");
  if (!isApiContext(ctx)) return ctx;
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get("status");
    const escalation = params.get("escalation");
    if (status && !STATUSES.includes(status)) return badRequest(`status must be one of ${STATUSES.join(", ")}`);
    if (escalation && !ESCALATIONS.includes(escalation)) return badRequest(`escalation must be one of ${ESCALATIONS.join(", ")}`);
    const limit = parseLimit(params.get("limit"));
    const cursor = decodeCursor(params.get("cursor"));

    const conditions: SQL[] = [eq(conversation.productId, ctx.productId)];
    if (status) conditions.push(eq(conversation.status, status));
    if (escalation) conditions.push(eq(conversation.escalationStatus, escalation));
    if (cursor) {
      conditions.push(
        or(
          lt(conversation.lastMessageAt, cursor.date),
          and(eq(conversation.lastMessageAt, cursor.date), lt(conversation.id, cursor.id)),
        )!,
      );
    }
    const rows = await db.query.conversation.findMany({
      where: and(...conditions),
      with: { customer: { columns: { id: true, name: true, email: true, externalId: true } } },
      orderBy: [desc(conversation.lastMessageAt), desc(conversation.id)],
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return Response.json({
      data: page.map(serializeConversation),
      nextCursor: rows.length > limit && last ? encodeCursor(last.lastMessageAt, last.id) : null,
    });
  } catch (error) {
    return handleApiErrors(error);
  }
}
