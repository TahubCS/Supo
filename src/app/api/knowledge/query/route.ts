import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { env } from "@/lib/env";
import { geminiEmbed, geminiGenerate } from "@/lib/knowledge/ai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== env.BETTER_AUTH_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId, question } = (await req.json()) as {
    productId: string;
    question: string;
  };

  if (!productId || !question) {
    return NextResponse.json({ error: "productId and question required" }, { status: 400 });
  }

  const queryEmbedding = await geminiEmbed(question, productId);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(
    sql`SELECT kc.id, kc.content, kc.metadata, ks.name AS source_name, ks.url AS source_url,
               1 - (kc.embedding <=> ${vectorStr}::vector) AS similarity
        FROM knowledge_chunk kc
        JOIN knowledge_source ks ON ks.id = kc.source_id
        WHERE kc.product_id = ${productId}
          AND ks.status = 'indexed'
        ORDER BY kc.embedding <=> ${vectorStr}::vector
        LIMIT 5`,
  );

  type ChunkRow = {
    id: string;
    content: string;
    metadata: string | null;
    source_name: string;
    source_url: string | null;
    similarity: number;
  };

  const MIN_SIMILARITY = 0.4;
  const chunks = (results.rows as ChunkRow[]).filter((c) => c.similarity >= MIN_SIMILARITY);

  if (chunks.length === 0) {
    return NextResponse.json({
      answer: "I don't have enough information in the knowledge base to answer that question.",
      sources: [],
    });
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.source_name}\n${c.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `You are a helpful support assistant. Answer the user's question using ONLY the provided knowledge base context.
Be concise and accurate. If the context doesn't contain enough information, say so clearly.
Always cite which source(s) your answer is based on by referencing them as [1], [2], etc.`;

  const prompt = `Knowledge base context:\n${context}\n\nQuestion: ${question}`;

  const answer = await geminiGenerate(prompt, systemPrompt);

  const sources = chunks
    .map((c) => ({ name: c.source_name, url: c.source_url }))
    .filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i);

  return NextResponse.json({ answer, sources });
}
