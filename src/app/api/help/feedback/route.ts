import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { article, product } from "@/db/schema";
import { recordArticleFeedback } from "@/lib/help-center/service";
import { getSecurityIp, isSecurityQuotaError, requireSecurityQuota } from "@/lib/security";

// "Was this article helpful?" votes from the public help center (same origin).
export async function POST(req: NextRequest) {
  let body: { articleId?: unknown; helpful?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.articleId !== "string" || typeof body.helpful !== "boolean") {
    return NextResponse.json({ error: "articleId and helpful are required" }, { status: 400 });
  }

  const row = await db
    .select({ id: article.id, productId: article.productId, organizationId: product.organizationId })
    .from(article)
    .innerJoin(product, eq(product.id, article.productId))
    .where(eq(article.id, body.articleId))
    .limit(1);
  if (!row[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // One vote per article per IP per hour keeps counts meaningful.
    await requireSecurityQuota("help.feedback.article.hour", `${row[0].id}:${getSecurityIp(req.headers)}`, {
      organizationId: row[0].organizationId,
      productId: row[0].productId,
      headerList: req.headers,
      path: "/api/help/feedback",
      method: "POST",
    });
  } catch (error) {
    if (isSecurityQuotaError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const counted = await recordArticleFeedback(row[0].id, body.helpful);
  if (!counted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
