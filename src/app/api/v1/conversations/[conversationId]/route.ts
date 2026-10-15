import { authenticateApi, isApiContext } from "@/lib/api/auth";
import {
  findApiConversation,
  reopenFromApi,
  resolveFromApi,
  serializeConversation,
  updateFieldsFromApi,
} from "@/lib/api/conversations";
import { ApiInputError, handleApiErrors, notFound, readJsonObject } from "@/lib/api/http";
import { isPriority, normalizeTags, PRIORITIES } from "@/lib/conversations/fields";

type Params = { params: Promise<{ conversationId: string }> };

/** GET /api/v1/conversations/{id} */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "conversations:read");
  if (!isApiContext(ctx)) return ctx;
  const conv = await findApiConversation(ctx, (await params).conversationId);
  if (!conv) return notFound("Conversation");
  return Response.json({ data: serializeConversation(conv) });
}

/** PATCH /api/v1/conversations/{id}  { status?: "open" | "resolved", priority?, tags? } */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await authenticateApi(req, "conversations:write");
  if (!isApiContext(ctx)) return ctx;
  try {
    const conv = await findApiConversation(ctx, (await params).conversationId);
    if (!conv) return notFound("Conversation");
    const body = await readJsonObject(req);

    const fields: { priority?: string; tags?: string[] } = {};
    if (body.priority !== undefined) {
      if (!isPriority(body.priority)) throw new ApiInputError(`priority must be one of ${PRIORITIES.join(", ")}`);
      fields.priority = body.priority;
    }
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
        throw new ApiInputError("tags must be an array of strings");
      }
      fields.tags = normalizeTags(body.tags as string[]);
    }
    if (body.status !== undefined && body.status !== "open" && body.status !== "resolved") {
      throw new ApiInputError('status must be "open" or "resolved"');
    }

    await updateFieldsFromApi(ctx, conv, fields);
    if (body.status === "resolved" && conv.status !== "resolved") await resolveFromApi(ctx, conv);
    if (body.status === "open" && conv.status !== "open") await reopenFromApi(ctx, conv);

    const updated = await findApiConversation(ctx, conv.id);
    return Response.json({ data: serializeConversation(updated!) });
  } catch (error) {
    return handleApiErrors(error);
  }
}
