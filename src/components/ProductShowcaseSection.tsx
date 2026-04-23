import { motion } from "motion/react";
import { Activity, ArrowUpRight, Bot, ChartLine, Inbox, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const inboxItems = [
  {
    name: "Payment verification failing",
    team: "Billing queue",
    state: "Escalated",
  },
  {
    name: "Reset access for EU workspace",
    team: "Account access",
    state: "Resolved by AI",
  },
  {
    name: "API limit spike after launch",
    team: "Technical support",
    state: "Waiting on agent",
  },
];

const insightItems = [
  {
    label: "AI resolution rate",
    value: "71%",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Median first response",
    value: "2m 14s",
    tone: "text-foreground",
  },
  {
    label: "Context preserved on handoff",
    value: "100%",
    tone: "text-foreground",
  },
];

export function ProductShowcaseSection() {
  return (
    <section id="product" className="border-b border-border/60 px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          className="mx-auto mb-14 max-w-3xl text-center"
        >
          <Badge
            variant="outline"
            className="mb-5 rounded-full border-border/70 px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase text-muted-foreground"
          >
            Product
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            A support system that looks built for operators.
          </h2>
          <p className="mt-5 text-balance text-lg leading-8 text-muted-foreground">
            Supo combines AI resolution, agent visibility, and operational controls in one
            surface so teams can move faster without losing context.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
          >
            <Card className="overflow-hidden border-border/70 bg-card/92 shadow-[0_24px_80px_-48px_rgba(19,24,56,0.45)]">
              <CardHeader className="border-b border-border/70">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl font-medium">Agent operations overview</CardTitle>
                    <CardDescription className="mt-2 max-w-xl leading-7">
                      Queue health, AI intervention, and handoff context in one dashboard-led
                      view.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="rounded-full border-border/70 px-3 py-1">
                    Live workspace
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 px-6 py-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Bot className="size-4" />
                      AI handled
                    </div>
                    <div className="mt-5 text-3xl font-semibold tracking-[-0.04em]">214</div>
                    <p className="mt-2 text-sm text-muted-foreground">Resolved in the last 24 hours</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Inbox className="size-4" />
                      Open queue
                    </div>
                    <div className="mt-5 text-3xl font-semibold tracking-[-0.04em]">18</div>
                    <p className="mt-2 text-sm text-muted-foreground">High-priority conversations waiting</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ChartLine className="size-4" />
                      CSAT trend
                    </div>
                    <div className="mt-5 text-3xl font-semibold tracking-[-0.04em]">+12%</div>
                    <p className="mt-2 text-sm text-muted-foreground">Week-over-week quality improvement</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground">Queue activity</h3>
                      <span className="text-xs text-muted-foreground">Last 24 hours</span>
                    </div>
                    <div className="space-y-3">
                      {inboxItems.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/70 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.team}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-full border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                          >
                            {item.state}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground">Operator signals</h3>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-3">
                      {insightItems.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-border/60 bg-card/70 px-4 py-3"
                        >
                          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {item.label}
                          </p>
                          <p className={`mt-2 text-2xl font-semibold tracking-[-0.04em] ${item.tone}`}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            className="grid gap-6"
          >
            <Card className="border-border/70 bg-card/92">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-medium">
                  <ShieldCheck className="size-4" />
                  Escalation integrity
                </CardTitle>
                <CardDescription>
                  Every handoff preserves timeline, suggested actions, and workspace context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Active policy
                  </p>
                  <p className="mt-2 text-sm leading-7 text-foreground">
                    Escalate billing disputes, risk signals, and account access recovery when
                    confidence falls below threshold.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Agent prep
                  </p>
                  <p className="mt-2 text-sm leading-7 text-foreground">
                    Summaries, previous resolution attempts, workspace plan, and knowledge links
                    are attached before takeover.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/92">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-medium">
                  <Activity className="size-4" />
                  Workflow visibility
                </CardTitle>
                <CardDescription>
                  See how AI, humans, and queue pressure interact before support quality drifts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-sm font-medium text-foreground">Queue saturation trending down</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automated routing reduced repeat backlog in billing and access queues.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-sm font-medium text-foreground">Knowledge gaps highlighted</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Newly repeated issues are surfaced for doc updates before they become ticket debt.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
