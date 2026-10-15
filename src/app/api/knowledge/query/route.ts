import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { authenticateApi, isApiContext } from "@/lib/api/auth";
import { readApiKey } from "@/lib/api/keys";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { geminiGenerate } from "@/lib/knowledge/ai";
import { buildSupportSystemPrompt } from "@/lib/knowledge/prompt";
import { citationsFor, retrieveKnowledge } from "@/lib/knowledge/retrieve";

export const maxDuration = 60;

// Legacy knowledge Q&A endpoint. Prefer POST /api/v1/knowledge/search with a
// product API key. Accepts either an API key (knowledge:read, product taken
// from the key) or the internal secret with an explicit productId.
export async function POST(req: NextRequest) {
  let keyProductId: string | null = null;
  if (readApiKey(req.headers)) {
    const ctx = await authenticateApi(req, "knowledge:read");
    if (!isApiContext(ctx)) return ctx;
    keyProductId = ctx.productId;
  } else if (!isAuthorizedInternalRequest(req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { productId?: string; question?: string };
  try {
    body = (await req.json()) as { productId?: string; question?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = keyProductId ?? body.productId?.trim();
  const question = body.question?.trim().slice(0, 2000);
  if (!productId || !question) {
    return NextResponse.json({ error: "productId and question required" }, { status: 400 });
  }

  const foundProduct = await db.query.product.findFirst({
    where: (p, { eq }) => eq(p.id, productId),
  });
  if (!foundProduct) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const retrieval = await retrieveKnowledge({ productId, query: question });
  if (retrieval.chunks.length === 0) {
    return NextResponse.json({
      answer: "I don't have enough information in the knowledge base to answer that question.",
      sources: [],
    });
  }

  const answer = await geminiGenerate(
    question,
    buildSupportSystemPrompt({
      botName: "Support",
      productName: foundProduct.name,
      productDescription: foundProduct.description,
      chunks: retrieval.chunks,
    }),
  );

  return NextResponse.json({ answer, sources: citationsFor(retrieval.chunks) });
}
