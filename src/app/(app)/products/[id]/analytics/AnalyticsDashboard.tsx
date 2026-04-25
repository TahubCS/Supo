"use client";

import { format, parseISO, subDays } from "date-fns";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Stats = {
  totalConversations: number;
  openConversations: number;
  customersServed: number;
  aiResolutionRate: number;
};

type Props = {
  stats: Stats;
  dailyVolume: { day: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  weeklyAiVsHuman: { week: string; ai: number; human: number }[];
  weeklyCustomers: { week: string; count: number }[];
};

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
        {value.toLocaleString()}
        {suffix && (
          <span className="text-lg font-medium text-[color:var(--text-secondary)]">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

const volumeConfig: ChartConfig = {
  count: {
    label: "Conversations",
    color: "var(--chart-1)",
  },
};

const aiVsHumanConfig: ChartConfig = {
  ai: { label: "AI handled", color: "var(--chart-1)" },
  human: { label: "Human escalated", color: "var(--chart-4)" },
};

const customersConfig: ChartConfig = {
  count: {
    label: "Active customers",
    color: "var(--chart-2)",
  },
};

const STATUS_COLORS: Record<string, string> = {
  open: "var(--chart-1)",
  resolved: "var(--status-success)",
  snoozed: "var(--status-warning)",
};

function formatWeek(week: string) {
  try {
    return format(parseISO(week), "MMM d");
  } catch {
    return week;
  }
}

function formatDay(day: string) {
  try {
    return format(parseISO(day), "MMM d");
  } catch {
    return day;
  }
}

export function AnalyticsDashboard({
  stats,
  dailyVolume,
  statusBreakdown,
  weeklyAiVsHuman,
  weeklyCustomers,
}: Props) {
  const isEmpty = stats.totalConversations === 0 && stats.openConversations === 0;

  // Fill daily volume gaps so every day in the last 30 days appears
  const filledDailyVolume = useMemo(() => {
    const map = new Map(dailyVolume.map((d) => [d.day, d.count]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = subDays(new Date(), 29 - i);
      const key = format(d, "yyyy-MM-dd");
      return { day: key, count: map.get(key) ?? 0 };
    });
  }, [dailyVolume]);

  // Fill weekly customers gaps
  const filledWeeklyCustomers = useMemo(() => {
    const map = new Map(weeklyCustomers.map((w) => [w.week, w.count]));
    return weeklyAiVsHuman.map((w) => ({
      week: w.week,
      count: map.get(w.week) ?? 0,
    }));
  }, [weeklyCustomers, weeklyAiVsHuman]);

  const statusData = useMemo(() => {
    const order = ["open", "resolved", "snoozed"];
    const map = new Map(statusBreakdown.map((s) => [s.status, s.count]));
    return order
      .filter((s) => map.has(s))
      .map((s) => ({ status: s, count: map.get(s)! }));
  }, [statusBreakdown]);

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Conversations (30d)" value={0} />
          <StatCard label="AI Resolution Rate" value={0} suffix="%" />
          <StatCard label="Open" value={0} />
          <StatCard label="Customers Served (30d)" value={0} />
        </div>
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground">No data yet</p>
          <p className="mt-1 max-w-sm text-sm text-[color:var(--text-secondary)]">
            Charts will appear once your widget starts receiving conversations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conversations (30d)" value={stats.totalConversations} />
        <StatCard label="AI Resolution Rate" value={stats.aiResolutionRate} suffix="%" />
        <StatCard label="Open Conversations" value={stats.openConversations} />
        <StatCard label="Customers Served (30d)" value={stats.customersServed} />
      </div>

      {/* Chart 1 — Conversation Volume (full width) */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="mb-4 text-sm font-medium text-foreground">Conversation Volume</p>
        <p className="mb-4 text-xs text-[color:var(--text-secondary)]">Daily conversations — last 30 days</p>
        <ChartContainer config={volumeConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={filledDailyVolume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={4}
              tickFormatter={formatDay}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              allowDecimals={false}
              className="text-xs"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(val) => formatDay(val as string)}
                />
              }
            />
            <Area
              dataKey="count"
              stroke="var(--chart-1)"
              fill="url(#volumeGrad)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Charts 2 & 3 — Status + AI vs Human (2-col) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Chart 2 — Status Breakdown (donut) */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-1 text-sm font-medium text-foreground">Status Breakdown</p>
          <p className="mb-4 text-xs text-[color:var(--text-secondary)]">Current distribution of all conversations</p>
          <ChartContainer config={{}} className="aspect-auto h-[220px] w-full">
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
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                label={({ status, percent }) =>
                  `${status} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {statusData.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] ?? "var(--chart-5)"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>

        {/* Chart 3 — AI vs Human weekly */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-1 text-sm font-medium text-foreground">AI vs Human</p>
          <p className="mb-4 text-xs text-[color:var(--text-secondary)]">Conversations handled by AI vs escalated — last 8 weeks</p>
          <ChartContainer config={aiVsHumanConfig} className="aspect-auto h-[220px] w-full">
            <BarChart data={weeklyAiVsHuman} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatWeek}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                allowDecimals={false}
                className="text-xs"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(val) => formatWeek(val as string)}
                  />
                }
              />
              <Bar dataKey="ai" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="human" fill="var(--chart-4)" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>

      {/* Chart 4 — Active Customers (full width) */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="mb-1 text-sm font-medium text-foreground">Active Customers</p>
        <p className="mb-4 text-xs text-[color:var(--text-secondary)]">Distinct customers who started conversations — last 8 weeks</p>
        <ChartContainer config={customersConfig} className="aspect-auto h-[200px] w-full">
          <LineChart
            data={filledWeeklyCustomers}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatWeek}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              allowDecimals={false}
              className="text-xs"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(val) => formatWeek(val as string)}
                />
              }
            />
            <Line
              dataKey="count"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={{ fill: "var(--chart-2)", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}
