import { db } from "@/db";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { ApiInputError, handleApiErrors, readJsonObject } from "@/lib/api/http";
import { geminiGenerate } from "@/lib/knowledge/ai";
import { buildSupportSystemPrompt } from "@/lib/knowledge/prompt";
import { citationsFor, retrieveKnowledge } from "@/lib/knowledge/retrieve";

export const maxDuration = 60;

/**
 * POST /api/v1/knowledge/search  { query, limit?, answer?: boolean }
 * Same retrieval as the widget. With `answer: true` the AI also writes an answer.
 */
export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "knowledge:read");
  if (!isApiContext(ctx)) return ctx;
  try {
    const body = await readJsonObject(req);
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 2000) : "";
    if (!query) throw new ApiInputError("query is required");
    const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), 20) : 6;

    const retrieval = await retrieveKnowledge({ productId: ctx.productId, query, limit });
    const results = retrieval.chunks.map((chunk) => ({
      sourceId: chunk.sourceId,
      title: chunk.title,
      url: chunk.url,
      headingPath: chunk.headingPath,
      content: chunk.content,
      score: chunk.similarity,
      relevant: chunk.relevant,
    }));

    let answer: string | null = null;
    if (body.answer === true && retrieval.chunks.length > 0) {
      const product = await db.query.product.findFirst({ where: (p, { eq }) => eq(p.id, ctx.productId) });
      answer = await geminiGenerate(
        query,
        buildSupportSystemPrompt({
          botName: "Support",
          productName: product?.name ?? "the product",
          productDescription: product?.description ?? null,
          chunks: retrieval.chunks,
        }),
      );
    }
    return Response.json({ data: { results, answer, sources: citationsFor(retrieval.chunks) } });
  } catch (error) {
    return handleApiErrors(error);
  }
}
