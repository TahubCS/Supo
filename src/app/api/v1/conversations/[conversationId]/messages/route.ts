import { and, asc, eq, gt, ne, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { message, user } from "@/db/schema";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { findApiConversation, postMessageFromApi } from "@/lib/api/conversations";
import { ApiInputError, handleApiErrors, notFound, parseLimit, readJsonObject } from "@/lib/api/http";

type Params = { params: Promise<{ conversationId: string }> };
const MAX_BODY = 5000;

/** GET /api/v1/conversations/{id}/messages?after=<seq>&limit=&notes=false (oldest first) */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "conversations:read");
  if (!isApiContext(ctx)) return ctx;
  try {
    const conv = await findApiConversation(ctx, (await params).conversationId);
    if (!conv) return notFound("Conversation");
    const search = new URL(req.url).searchParams;
    const after = search.get("after");
    if (after !== null && !/^\d{1,15}$/.test(after)) throw new ApiInputError("after must be a message seq number");
    const limit = parseLimit(search.get("limit"), 100, 500);
    const conditions: SQL[] = [eq(message.conversationId, conv.id)];
    if (after !== null) conditions.push(gt(message.seq, Number(after)));
    if (search.get("notes") === "false") conditions.push(ne(message.senderType, "note"));

    const rows = await db
      .select({
        id: message.id,
        seq: message.seq,
        senderType: message.senderType,
        senderId: message.senderId,
        senderName: user.name,
        body: message.body,
        sources: message.sources,
        createdAt: message.createdAt,
      })
      .from(message)
      .leftJoin(user, eq(user.id, message.senderId))
      .where(and(...conditions))
      .orderBy(asc(message.seq))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return Response.json({
      data: page.map((m) => ({ ...m, sources: m.sources ?? [], createdAt: m.createdAt.toISOString() })),
      nextAfter: rows.length > limit ? page.at(-1)!.seq : null,
    });
  } catch (error) {
    return handleApiErrors(error);
  }
}

/** POST /api/v1/conversations/{id}/messages  { body, type?: "reply" | "note" } */
export async function POST(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "conversations:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const conv = await findApiConversation(ctx, (await params).conversationId);
    if (!conv) return notFound("Conversation");
    const input = await readJsonObject(req);
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!body) throw new ApiInputError("body is required");
    if (body.length > MAX_BODY) throw new ApiInputError(`body is limited to ${MAX_BODY} characters`);
    const type = input.type ?? "reply";
    if (type !== "reply" && type !== "note") throw new ApiInputError('type must be "reply" or "note"');

    const saved = await postMessageFromApi(ctx, conv, body, type);
    return Response.json(
      {
        data: {
          id: saved.id,
          seq: saved.seq,
          conversationId: conv.id,
          senderType: type === "note" ? "note" : "agent",
          body,
          createdAt: saved.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiErrors(error);
  }
}
