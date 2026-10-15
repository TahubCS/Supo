"use client";

import { format, parseISO } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ANALYTICS_RANGES } from "@/lib/analytics/range";
import type { ProductAnalytics, SummaryMetrics } from "@/lib/analytics/service";

const volumeConfig: ChartConfig = {
  aiOnly: { label: "Resolved by AI", color: "var(--chart-1)" },
  escalated: { label: "Handed to a human", color: "var(--chart-4)" },
};

const STATUS_COLORS: Record<string, string> = {
  open: "var(--chart-1)",
  resolved: "var(--status-success)",
  snoozed: "var(--status-warning)",
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function formatDay(day: string) {
  try {
    return format(parseISO(day), "MMM d");
  } catch {
    return day;
  }
}

type Delta = { value: number | null; previous: number | null; higherIsBetter: boolean; kind: "ratio" | "count" | "duration" | "score" };

function DeltaTag({ value, previous, higherIsBetter, kind }: Delta) {
  if (value === null || previous === null || previous === 0) return null;
  const diff = value - previous;
  if (Math.abs(diff) < 1e-9) return null;
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const label =
    kind === "ratio"
      ? `${Math.abs(Math.round(diff * 100))} pts`
      : kind === "score"
        ? Math.abs(diff).toFixed(1)
        : `${Math.abs(Math.round((diff / previous) * 100))}%`;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${good ? "text-emerald-500" : "text-red-500"}`}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        {delta && <DeltaTag {...delta} />}
      </div>
      {hint && <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

function summaryCards(current: SummaryMetrics, previous: SummaryMetrics, days: number) {
  return [
    {
      label: `Conversations (${days}d)`,
      value: current.conversations.toLocaleString(),
      hint: `${current.customers.toLocaleString()} customers`,
      delta: { value: current.conversations, previous: previous.conversations, higherIsBetter: true, kind: "count" as const },
    },
    {
      label: "AI deflection",
      value: percent(current.deflectionRate),
      hint: `${current.aiOnly.toLocaleString()} answered without a human`,
      delta: { value: current.deflectionRate, previous: previous.deflectionRate, higherIsBetter: true, kind: "ratio" as const },
    },
    {
      label: "First response (median)",
      value: formatDuration(current.firstResponseP50),
      hint: `90th percentile ${formatDuration(current.firstResponseP90)}`,
      delta: {
        value: current.firstResponseP50,
        previous: previous.firstResponseP50,
        higherIsBetter: false,
        kind: "duration" as const,
      },
    },
    {
      label: "CSAT",
      value: current.csatAverage === null ? "—" : `${current.csatAverage.toFixed(1)} / 5`,
      hint:
        current.csatResponses > 0
          ? `${percent(current.csatSatisfied)} satisfied · ${current.csatResponses} ratings`
          : "No ratings yet",
      delta: { value: current.csatAverage, previous: previous.csatAverage, higherIsBetter: true, kind: "score" as const },
    },
    {
      label: "SLA attainment",
      value: percent(current.slaAttainment),
      hint:
        current.slaTracked > 0
          ? `${current.slaMet} of ${current.slaTracked} first responses on time`
          : "Set SLA targets in Inbox settings",
      delta: { value: current.slaAttainment, previous: previous.slaAttainment, higherIsBetter: true, kind: "ratio" as const },
    },
    {
      label: "Resolution time (median)",
      value: formatDuration(current.resolutionP50),
      hint: `90th percentile ${formatDuration(current.resolutionP90)}`,
      delta: {
        value: current.resolutionP50,
        previous: previous.resolutionP50,
        higherIsBetter: false,
        kind: "duration" as const,
      },
    },
    {
      label: "Knowledge base answer rate",
      value: percent(current.kbHitRate),
      hint: `${current.groundedAnswers.toLocaleString()} of ${current.aiAnswers.toLocaleString()} AI replies cited a source`,
      delta: { value: current.kbHitRate, previous: previous.kbHitRate, higherIsBetter: true, kind: "ratio" as const },
    },
    {
      label: "Escalated to humans",
      value: current.escalated.toLocaleString(),
      hint: `${current.resolved.toLocaleString()} conversations resolved`,
    },
  ];
}

export function AnalyticsDashboard({ productId, analytics }: { productId: string; analytics: ProductAnalytics }) {
  const { current, previous, daily, agents, gaps, statusBreakdown, window } = analytics;
  const cards = summaryCards(current, previous, window.days);
  const statusData = ["open", "resolved", "snoozed"]
    .map((status) => ({ status, count: statusBreakdown.find((s) => s.status === status)?.count ?? 0 }))
    .filter((s) => s.count > 0);
  const tickInterval = Math.max(0, Math.floor(daily.length / 8) - 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {ANALYTICS_RANGES.map((days) => (
            <Link
              key={days}
              href={`/products/${productId}/analytics?range=${days}`}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                window.days === days
                  ? "bg-[color:var(--card-elevated)] text-foreground"
                  : "text-[color:var(--text-secondary)] hover:text-foreground"
              }`}
            >
              Last {days} days
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[color:var(--text-tertiary)]">
            Days in {window.timezone} · compared with the previous {window.days} days
          </span>
          <a
            href={`/products/${productId}/analytics/export?range=${window.days}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[color:var(--card-elevated)]"
          >
            <Download className="size-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="mb-1 text-sm font-medium text-foreground">Conversation volume</p>
        <p className="mb-4 text-xs text-[color:var(--text-secondary)]">
          New conversations per day, split by whether a human was involved
        </p>
        <ChartContainer config={volumeConfig} className="aspect-auto h-[240px] w-full">
          <AreaChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={tickInterval}
              tickFormatter={formatDay}
              className="text-xs"
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={4} allowDecimals={false} className="text-xs" />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(val) => formatDay(val as string)} />} />
            <Area
              dataKey="aiOnly"
              stackId="volume"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <Area
              dataKey="escalated"
              stackId="volume"
              stroke="var(--chart-4)"
              fill="var(--chart-4)"
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <p className="mb-1 text-sm font-medium text-foreground">Team performance</p>
          <p className="mb-4 text-xs text-[color:var(--text-secondary)]">Human agents in the selected period</p>
          {agents.length === 0 ? (
            <p className="py-8 text-center text-xs text-[color:var(--text-secondary)]">
              No agent activity in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[color:var(--text-tertiary)]">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 text-right font-medium">Conversations</th>
                    <th className="py-2 pr-3 text-right font-medium">Replies</th>
                    <th className="py-2 pr-3 text-right font-medium">Resolved</th>
                    <th className="py-2 pr-3 text-right font-medium">First response</th>
                    <th className="py-2 text-right font-medium">CSAT</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.agentId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{agent.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{agent.conversations}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{agent.replies}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{agent.resolved}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(agent.firstResponseP50)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {agent.csatAverage === null ? "—" : `${agent.csatAverage.toFixed(1)} (${agent.csatResponses})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-1 text-sm font-medium text-foreground">Status</p>
          <p className="mb-4 text-xs text-[color:var(--text-secondary)]">All conversations right now</p>
          {statusData.length === 0 ? (
            <p className="py-8 text-center text-xs text-[color:var(--text-secondary)]">No conversations yet.</p>
          ) : (
            <ChartContainer config={{}} className="aspect-auto h-[200px] w-full">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0];
                    return (
                      <div className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <span className="capitalize text-foreground">{item.name}</span>
                        <span className="ml-2 font-medium text-foreground">{item.value}</span>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ status, percent: share }) => `${status} ${(share * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "var(--chart-5)"} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">Top unanswered questions</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Questions the knowledge base couldn&apos;t answer, by how often customers asked them
            </p>
          </div>
          <Link
            href={`/products/${productId}/knowledge`}
            className="shrink-0 text-xs font-medium text-foreground hover:underline"
          >
            Review in Knowledge →
          </Link>
        </div>
        {gaps.length === 0 ? (
          <p className="py-6 text-center text-xs text-[color:var(--text-secondary)]">
            No open knowledge gaps. Nice work.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {gaps.map((gap) => (
              <li key={gap.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="truncate text-foreground">{gap.question}</span>
                <span className="shrink-0 rounded-full bg-[color:var(--card-elevated)] px-2 py-0.5 tabular-nums text-[color:var(--text-secondary)]">
                  {gap.hits}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
