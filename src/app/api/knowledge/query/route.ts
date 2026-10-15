import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { geminiGenerate } from "@/lib/knowledge/ai";
import { buildSupportSystemPrompt } from "@/lib/knowledge/prompt";
import { citationsFor, retrieveKnowledge } from "@/lib/knowledge/retrieve";

export const maxDuration = 60;

// Internal knowledge Q&A endpoint (server-to-server). Uses the same retrieval
// and prompt as the widget.
export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { productId?: string; question?: string };
  try {
    body = (await req.json()) as { productId?: string; question?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
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
