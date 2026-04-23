"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 pt-32 pb-24">
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" />
          <span className="text-xs text-[color:var(--text-secondary)]">
            Now with GPT-4o integration
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl lg:text-7xl"
        >
          Enterprise customer support,
          <br />
          powered by AI
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-8 max-w-2xl text-lg leading-relaxed text-[color:var(--text-secondary)]"
        >
          Resolve 80% of customer inquiries instantly with AI agents. Seamlessly hand
          off complex cases to your team with full context.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
        >
          <Button
            size="default"
            className="rounded-lg bg-foreground px-6 py-2.5 text-sm text-background hover:bg-foreground/90"
          >
            Start free trial
          </Button>
          <Button
            variant="ghost"
            size="default"
            className="group rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground"
          >
            View documentation
            <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mb-16 grid grid-cols-1 gap-8 sm:grid-cols-3"
        >
          <div>
            <div className="mb-1 text-3xl font-bold text-foreground">2.3s</div>
            <div className="text-sm text-[color:var(--text-secondary)]">
              Average response time
            </div>
          </div>
          <div>
            <div className="mb-1 text-3xl font-bold text-foreground">94%</div>
            <div className="text-sm text-[color:var(--text-secondary)]">
              Resolution rate
            </div>
          </div>
          <div>
            <div className="mb-1 text-3xl font-bold text-foreground">99.9%</div>
            <div className="text-sm text-[color:var(--text-secondary)]">
              Uptime SLA
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative"
        >
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="text-sm text-foreground">Overview</div>
                <div className="text-sm text-[color:var(--text-secondary)]">
                  Conversations
                </div>
                <div className="text-sm text-[color:var(--text-secondary)]">
                  Analytics
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[color:var(--status-success)]" />
                <span className="text-xs text-[color:var(--text-secondary)]">
                  All systems operational
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
              <div className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--card-elevated)] p-4">
                <div className="mb-2 text-xs text-[color:var(--text-secondary)]">
                  Active Conversations
                </div>
                <div className="mb-1 text-2xl font-bold text-foreground">127</div>
                <div className="flex items-center gap-1 text-xs text-[color:var(--status-success)]">
                  <Check className="size-3" />
                  <span>+12% from last hour</span>
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--card-elevated)] p-4">
                <div className="mb-2 text-xs text-[color:var(--text-secondary)]">
                  AI Resolution
                </div>
                <div className="mb-1 text-2xl font-bold text-foreground">82%</div>
                <div className="flex items-center gap-1 text-xs text-[color:var(--status-success)]">
                  <Check className="size-3" />
                  <span>+5% from yesterday</span>
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--card-elevated)] p-4">
                <div className="mb-2 text-xs text-[color:var(--text-secondary)]">
                  Avg. Response
                </div>
                <div className="mb-1 text-2xl font-bold text-foreground">2.1s</div>
                <div className="flex items-center gap-1 text-xs text-[color:var(--text-secondary)]">
                  <span>Within SLA</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute -inset-px -z-10 rounded-lg bg-linear-to-b from-border to-transparent opacity-50" />
        </motion.div>
      </div>
    </section>
  );
}
