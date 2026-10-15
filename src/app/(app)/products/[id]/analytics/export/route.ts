import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { toCsv } from "@/lib/analytics/csv";
import { parseRange } from "@/lib/analytics/range";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

const MAX_ROWS = 50_000;

const HEADER = [
  "conversation_id",
  "created_at",
  "customer_name",
  "customer_email",
  "channel",
  "status",
  "priority",
  "tags",
  "handoff_reason",
  "escalated_at",
  "first_response_at",
  "first_response_due_at",
  "first_response_sla",
  "resolved_at",
  "resolution_due_at",
  "resolved_by",
  "assignee",
  "ai_only",
  "messages",
  "csat_score",
  "csat_comment",
];

/** Conversation-level export of the selected analytics window. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "analytics")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const days = parseRange(req.nextUrl.searchParams.get("range"));
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    SELECT c.id, c.created_at, cu.name AS customer_name, cu.email AS customer_email, c.channel, c.status,
           c.priority, array_to_string(c.tags, ' ') AS tags, c.handoff_reason, c.escalated_at,
           c.first_response_at, c.first_response_due_at, c.resolved_at, c.resolution_due_at,
           resolver.name AS resolved_by, assignee.name AS assignee,
           (c.escalated_at IS NULL AND NOT EXISTS (
              SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.sender_type = 'agent'
           )) AS ai_only,
           (SELECT count(*)::int FROM message m WHERE m.conversation_id = c.id AND m.sender_type <> 'note') AS messages,
           r.score AS csat_score, r.comment AS csat_comment
      FROM conversation c
      JOIN customer cu ON cu.id = c.customer_id
      LEFT JOIN "user" resolver ON resolver.id = c.resolved_by_id
      LEFT JOIN "user" assignee ON assignee.id = c.assignee_id
      LEFT JOIN conversation_rating r ON r.conversation_id = c.id
     WHERE c.product_id = ${id}
       AND c.created_at >= ${start.toISOString()} AND c.created_at < ${end.toISOString()}
     ORDER BY c.created_at DESC
     LIMIT ${MAX_ROWS}`);

  // drizzle returns raw `timestamp` (UTC, no zone) values as strings.
  const asDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(`${String(value).replace(" ", "T")}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const rows = (result.rows as Record<string, unknown>[]).map((row) => {
    const due = asDate(row.first_response_due_at);
    const responded = asDate(row.first_response_at);
    const sla = !due ? "" : responded ? (responded <= due ? "met" : "breached") : due < end ? "breached" : "pending";
    return [
      row.id,
      asDate(row.created_at),
      row.customer_name,
      row.customer_email,
      row.channel,
      row.status,
      row.priority,
      row.tags,
      row.handoff_reason,
      asDate(row.escalated_at),
      responded,
      due,
      sla,
      asDate(row.resolved_at),
      asDate(row.resolution_due_at),
      row.resolved_by,
      row.assignee,
      row.ai_only ? "yes" : "no",
      row.messages,
      row.csat_score,
      row.csat_comment,
    ];
  });

  const filename = `supo-${access.product.name}-conversations-${days}d.csv`.replace(/[^\w.-]/g, "_");
  return new NextResponse(toCsv(HEADER, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
