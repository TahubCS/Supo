import { BarChart2 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
        Analytics
      </p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        Analytics
      </h1>

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <BarChart2 className="mb-4 size-8 text-[color:var(--text-secondary)]" />
        <h2 className="mb-2 text-base font-medium text-foreground">
          No data yet
        </h2>
        <p className="max-w-sm text-sm text-[color:var(--text-secondary)]">
          Conversation volumes, AI resolution rates, and response time metrics
          will appear here once your widget receives traffic.
        </p>
      </div>
    </div>
  );
}
