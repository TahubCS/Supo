import { type NextRequest, NextResponse } from "next/server";

import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { ingestSource } from "@/lib/knowledge/ingest";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req.headers)) {
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
