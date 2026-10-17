"use client";

import { ArrowRight, FileText } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const heroPoints = [
  { title: "Cited answers", description: "Replies cite the docs they came from" },
  { title: "Human handoff", description: "Agents pick up with the full conversation" },
  { title: "One-line embed", description: "A script tag or the React SDK" },
];

// Illustrates the product flow; the handoff line is the widget's real reply.
const exampleConversation: { from: "customer" | "ai" | "agent"; text: string; source?: string }[] = [
  { from: "customer", text: "How do I rotate an API key?" },
  {
    from: "ai",
    text: "Create a new key under Integrations → API keys, switch your app to it, then revoke the old one. New keys are shown only once, so copy it right away.",
    source: "API reference",
  },
  { from: "customer", text: "Thanks. Can I talk to someone about my invoice?" },
  { from: "ai", text: "Connecting you with our support team." },
  { from: "agent", text: "Hi, I'm on the billing team. Let me pull up your invoice." },
];

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
            Now in open alpha
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
          Answer customer questions instantly with AI grounded in your own docs,
          and hand complex cases to your team with the full conversation.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
        >
          <Button
            asChild
            size="default"
            className="rounded-lg bg-foreground px-6 py-2.5 text-sm text-background hover:bg-foreground/90"
          >
            <Link href="/sign-up">Get started free</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="default"
            className="group rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground"
          >
            <Link href="/sign-up/team">
              Start for your team
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mb-16 grid grid-cols-1 gap-8 sm:grid-cols-3"
        >
          {heroPoints.map((point) => (
            <div key={point.title}>
              <div className="mb-1 text-base font-semibold text-foreground">{point.title}</div>
              <div className="text-sm text-[color:var(--text-secondary)]">{point.description}</div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative"
        >
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="text-sm text-foreground">Example conversation</div>
              <div className="text-xs text-[color:var(--text-secondary)]">Cited answer, then a handoff</div>
            </div>
            <div className="space-y-4 p-6">
              {exampleConversation.map((message, index) => (
                <div
                  key={index}
                  className={`flex flex-col gap-1 ${message.from === "customer" ? "items-end" : "items-start"}`}
                >
                  {message.from === "customer" ? null : (
                    <span className="text-xs text-[color:var(--text-tertiary)]">
                      {message.from === "ai" ? "AI" : "Agent"}
                    </span>
                  )}
                  <div
                    className={`max-w-md rounded-lg px-4 py-2.5 text-sm ${
                      message.from === "customer"
                        ? "bg-foreground text-background"
                        : "border border-[color:var(--border-subtle)] bg-[color:var(--card-elevated)] text-foreground"
                    }`}
                  >
                    {message.text}
                  </div>
                  {message.source ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[color:var(--text-secondary)]">
                      <FileText className="size-3" />
                      {message.source}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute -inset-px -z-10 rounded-lg bg-linear-to-b from-border to-transparent opacity-50" />
        </motion.div>
      </div>
    </section>
  );
}
