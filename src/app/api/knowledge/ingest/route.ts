import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { ingestSource } from "@/lib/knowledge/ingest";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== env.BETTER_AUTH_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId, productId } = (await req.json()) as {
    sourceId: string;
    productId: string;
  };

  if (!sourceId || !productId) {
    return NextResponse.json({ error: "sourceId and productId required" }, { status: 400 });
  }

  await ingestSource(sourceId, productId);
  return NextResponse.json({ ok: true });
}
