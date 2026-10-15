import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { knowledgeSuggestion, user } from "@/db/schema";
import { isValidTimeZone } from "@/lib/sla/hours";
import { getBusinessHours } from "@/lib/sla/service";

import { type AnalyticsRange } from "./range";

export { ANALYTICS_RANGES, parseRange, type AnalyticsRange } from "./range";

export type AnalyticsWindow = { start: Date; end: Date; days: AnalyticsRange; timezone: string };

/** Window ending now; the product's business-hours timezone is used for daily buckets. */
export async function resolveWindow(productId: string, days: AnalyticsRange, now = new Date()): Promise<AnalyticsWindow> {
  const hours = await getBusinessHours(productId);
  const timezone = isValidTimeZone(hours.timezone) ? hours.timezone : "UTC";
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now, days, timezone };
}

export type SummaryMetrics = {
  conversations: number;
  customers: number;
  escalated: number;
  aiOnly: number;
  resolved: number;
  // AI deflection: conversations the AI answered without any human involvement.
  deflectionRate: number | null;
  firstResponseP50: number | null; // seconds, handoff → first human reply
  firstResponseP90: number | null;
  resolutionP50: number | null; // seconds, conversation start → resolved
  resolutionP90: number | null;
  slaTracked: number;
  slaMet: number;
  slaAttainment: number | null;
  csatResponses: number;
  csatAverage: number | null;
  csatSatisfied: number | null; // share of 4-5 ratings
  aiAnswers: number;
  groundedAnswers: number;
  kbHitRate: number | null; // AI answers that cited the knowledge base
};

type Row = Record<string, unknown>;

// Raw SQL parameters: pass ISO strings (UTC) so node-postgres doesn't
// serialize Dates in the server's local timezone for timestamp columns.
const iso = (date: Date) => date.toISOString();

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

export async function getSummary(productId: string, start: Date, end: Date): Promise<SummaryMetrics> {
  const [conv, csat, kb] = await Promise.all([
    db.execute(sql`
      WITH conv AS (
        SELECT c.id, c.customer_id, c.status, c.created_at, c.escalated_at, c.first_response_at,
               c.first_response_due_at, c.resolved_at,
               EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.sender_type = 'agent') AS has_agent,
               EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.sender_type = 'ai') AS has_ai
          FROM conversation c
         WHERE c.product_id = ${productId} AND c.created_at >= ${iso(start)} AND c.created_at < ${iso(end)}
      )
      SELECT count(*)::int AS total,
             count(DISTINCT customer_id)::int AS customers,
             count(*) FILTER (WHERE escalated_at IS NOT NULL)::int AS escalated,
             count(*) FILTER (WHERE has_ai AND NOT has_agent AND escalated_at IS NULL)::int AS ai_only,
             count(*) FILTER (WHERE has_ai OR has_agent)::int AS answered,
             count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM first_response_at - escalated_at))
               FILTER (WHERE first_response_at >= escalated_at) AS frt_p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM first_response_at - escalated_at))
               FILTER (WHERE first_response_at >= escalated_at) AS frt_p90,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM resolved_at - created_at))
               FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL) AS res_p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM resolved_at - created_at))
               FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL) AS res_p90,
             count(*) FILTER (
               WHERE first_response_due_at IS NOT NULL
                 AND (first_response_at IS NOT NULL OR first_response_due_at < ${iso(end)})
             )::int AS sla_tracked,
             count(*) FILTER (
               WHERE first_response_due_at IS NOT NULL AND first_response_at <= first_response_due_at
             )::int AS sla_met
        FROM conv`),
    db.execute(sql`
      SELECT count(*)::int AS responses,
             avg(score)::float8 AS average,
             count(*) FILTER (WHERE score >= 4)::int AS satisfied
        FROM conversation_rating
       WHERE product_id = ${productId} AND created_at >= ${iso(start)} AND created_at < ${iso(end)}`),
    db.execute(sql`
      SELECT count(*)::int AS answers,
             count(*) FILTER (
               WHERE jsonb_typeof(m.sources) = 'array' AND jsonb_array_length(m.sources) > 0
             )::int AS grounded
        FROM message m
        JOIN conversation c ON c.id = m.conversation_id
       WHERE c.product_id = ${productId} AND m.sender_type = 'ai'
         AND m.created_at >= ${iso(start)} AND m.created_at < ${iso(end)}`),
  ]);

  const c = (conv.rows[0] ?? {}) as Row;
  const r = (csat.rows[0] ?? {}) as Row;
  const k = (kb.rows[0] ?? {}) as Row;
  const slaTracked = num(c.sla_tracked);
  const slaMet = num(c.sla_met);
  const csatResponses = num(r.responses);
  const aiAnswers = num(k.answers);
  const groundedAnswers = num(k.grounded);
  return {
    conversations: num(c.total),
    customers: num(c.customers),
    escalated: num(c.escalated),
    aiOnly: num(c.ai_only),
    resolved: num(c.resolved),
    deflectionRate: ratio(num(c.ai_only), num(c.answered)),
    firstResponseP50: numOrNull(c.frt_p50),
    firstResponseP90: numOrNull(c.frt_p90),
    resolutionP50: numOrNull(c.res_p50),
    resolutionP90: numOrNull(c.res_p90),
    slaTracked,
    slaMet,
    slaAttainment: ratio(slaMet, slaTracked),
    csatResponses,
    csatAverage: numOrNull(r.average),
    csatSatisfied: ratio(num(r.satisfied), csatResponses),
    aiAnswers,
    groundedAnswers,
    kbHitRate: ratio(groundedAnswers, aiAnswers),
  };
}

export type DailyPoint = { day: string; conversations: number; escalated: number; aiOnly: number };

/** Every local day in the window, including empty ones. */
export function fillDays(window: AnalyticsWindow, rows: DailyPoint[]): DailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: window.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days: DailyPoint[] = [];
  const seen = new Set<string>();
  // Step by hours so DST days are not skipped; de-duplicate by local date.
  for (let t = window.start.getTime(); t <= window.end.getTime(); t += 60 * 60 * 1000) {
    const day = formatter.format(new Date(t));
    if (seen.has(day)) continue;
    seen.add(day);
    days.push(byDay.get(day) ?? { day, conversations: 0, escalated: 0, aiOnly: 0 });
  }
  return days;
}

export async function getDailyVolume(productId: string, window: AnalyticsWindow): Promise<DailyPoint[]> {
  const result = await db.execute(sql`
    SELECT to_char((c.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${window.timezone}, 'YYYY-MM-DD') AS day,
           count(*)::int AS conversations,
           count(*) FILTER (WHERE c.escalated_at IS NOT NULL)::int AS escalated,
           count(*) FILTER (
             WHERE c.escalated_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.sender_type = 'agent')
           )::int AS ai_only
      FROM conversation c
     WHERE c.product_id = ${productId} AND c.created_at >= ${iso(window.start)} AND c.created_at < ${iso(window.end)}
     GROUP BY 1
     ORDER BY 1`);
  const rows = (result.rows as Row[]).map((row) => ({
    day: String(row.day),
    conversations: num(row.conversations),
    escalated: num(row.escalated),
    aiOnly: num(row.ai_only),
  }));
  return fillDays(window, rows);
}

export type AgentMetrics = {
  agentId: string;
  name: string;
  replies: number;
  conversations: number;
  resolved: number;
  firstResponseP50: number | null;
  csatResponses: number;
  csatAverage: number | null;
};

export async function getAgentMetrics(productId: string, start: Date, end: Date): Promise<AgentMetrics[]> {
  const [replies, resolved, firstResponses, ratings] = await Promise.all([
    db.execute(sql`
      SELECT m.sender_id AS agent_id, count(*)::int AS replies, count(DISTINCT m.conversation_id)::int AS conversations
        FROM message m
        JOIN conversation c ON c.id = m.conversation_id
       WHERE c.product_id = ${productId} AND m.sender_type = 'agent' AND m.sender_id IS NOT NULL
         AND m.created_at >= ${iso(start)} AND m.created_at < ${iso(end)}
       GROUP BY m.sender_id`),
    db.execute(sql`
      SELECT resolved_by_id AS agent_id, count(*)::int AS resolved
        FROM conversation
       WHERE product_id = ${productId} AND status = 'resolved' AND resolved_by_id IS NOT NULL
         AND resolved_at >= ${iso(start)} AND resolved_at < ${iso(end)}
       GROUP BY resolved_by_id`),
    // The agent who sent the first human reply after each handoff.
    db.execute(sql`
      WITH first_reply AS (
        SELECT DISTINCT ON (m.conversation_id)
               m.sender_id AS agent_id, EXTRACT(EPOCH FROM m.created_at - c.escalated_at) AS seconds
          FROM message m
          JOIN conversation c ON c.id = m.conversation_id
         WHERE c.product_id = ${productId} AND c.escalated_at IS NOT NULL
           AND c.escalated_at >= ${iso(start)} AND c.escalated_at < ${iso(end)}
           AND m.sender_type = 'agent' AND m.sender_id IS NOT NULL AND m.created_at >= c.escalated_at
         ORDER BY m.conversation_id, m.seq
      )
      SELECT agent_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS p50
        FROM first_reply
       GROUP BY agent_id`),
    db.execute(sql`
      SELECT agent_id, count(*)::int AS responses, avg(score)::float8 AS average
        FROM conversation_rating
       WHERE product_id = ${productId} AND agent_id IS NOT NULL AND created_at >= ${iso(start)} AND created_at < ${iso(end)}
       GROUP BY agent_id`),
  ]);

  const metrics = new Map<string, AgentMetrics>();
  const entry = (agentId: string) => {
    let current = metrics.get(agentId);
    if (!current) {
      current = {
        agentId,
        name: "Unknown",
        replies: 0,
        conversations: 0,
        resolved: 0,
        firstResponseP50: null,
        csatResponses: 0,
        csatAverage: null,
      };
      metrics.set(agentId, current);
    }
    return current;
  };
  for (const row of replies.rows as Row[]) {
    const e = entry(String(row.agent_id));
    e.replies = num(row.replies);
    e.conversations = num(row.conversations);
  }
  for (const row of resolved.rows as Row[]) entry(String(row.agent_id)).resolved = num(row.resolved);
  for (const row of firstResponses.rows as Row[]) entry(String(row.agent_id)).firstResponseP50 = numOrNull(row.p50);
  for (const row of ratings.rows as Row[]) {
    const e = entry(String(row.agent_id));
    e.csatResponses = num(row.responses);
    e.csatAverage = numOrNull(row.average);
  }

  const ids = [...metrics.keys()];
  if (ids.length > 0) {
    const names = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids));
    for (const row of names) metrics.get(row.id)!.name = row.name;
  }
  return [...metrics.values()].sort((a, b) => b.resolved - a.resolved || b.replies - a.replies);
}

export type KnowledgeGap = { id: string; question: string; hits: number; updatedAt: Date };

/** Most-asked questions the knowledge base could not answer (open gap suggestions). */
export async function getTopGaps(productId: string, limit = 8): Promise<KnowledgeGap[]> {
  return db
    .select({
      id: knowledgeSuggestion.id,
      question: knowledgeSuggestion.question,
      hits: knowledgeSuggestion.hits,
      updatedAt: knowledgeSuggestion.updatedAt,
    })
    .from(knowledgeSuggestion)
    .where(
      and(
        eq(knowledgeSuggestion.productId, productId),
        eq(knowledgeSuggestion.kind, "gap"),
        eq(knowledgeSuggestion.status, "pending"),
      ),
    )
    .orderBy(desc(knowledgeSuggestion.hits), desc(knowledgeSuggestion.updatedAt))
    .limit(limit);
}

export async function getStatusBreakdown(productId: string) {
  const result = await db.execute(sql`
    SELECT status, count(*)::int AS count FROM conversation WHERE product_id = ${productId} GROUP BY status`);
  return (result.rows as Row[]).map((row) => ({ status: String(row.status), count: num(row.count) }));
}

export type ProductAnalytics = {
  window: { days: AnalyticsRange; timezone: string; start: string; end: string };
  current: SummaryMetrics;
  previous: SummaryMetrics;
  daily: DailyPoint[];
  agents: AgentMetrics[];
  gaps: KnowledgeGap[];
  statusBreakdown: { status: string; count: number }[];
};

export async function getProductAnalytics(productId: string, days: AnalyticsRange): Promise<ProductAnalytics> {
  const window = await resolveWindow(productId, days);
  const previousStart = new Date(window.start.getTime() - (window.end.getTime() - window.start.getTime()));
  const [current, previous, daily, agents, gaps, statusBreakdown] = await Promise.all([
    getSummary(productId, window.start, window.end),
    getSummary(productId, previousStart, window.start),
    getDailyVolume(productId, window),
    getAgentMetrics(productId, window.start, window.end),
    getTopGaps(productId),
    getStatusBreakdown(productId),
  ]);
  return {
    window: { days, timezone: window.timezone, start: window.start.toISOString(), end: window.end.toISOString() },
    current,
    previous,
    daily,
    agents,
    gaps,
    statusBreakdown,
  };
}
