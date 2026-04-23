"use client";

import {
  ArrowUpRight,
  BarChart3,
  Brain,
  Code2,
  Inbox,
  MessageSquare,
} from "lucide-react";
import { motion } from "motion/react";

const features = [
  {
    icon: Brain,
    title: "AI Resolution Engine",
    description:
      "Advanced language models trained on your knowledge base to resolve customer issues instantly.",
  },
  {
    icon: ArrowUpRight,
    title: "Smart Escalation",
    description:
      "Automatically detects when human intervention is needed and routes to the right team member.",
  },
  {
    icon: MessageSquare,
    title: "Live Agent Handoff",
    description:
      "Seamless transition from AI to human support with full conversation context preserved.",
  },
  {
    icon: Inbox,
    title: "Multi-channel Inbox",
    description:
      "Unified inbox for email, chat, and social media support across all your channels.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description:
      "Real-time insights into resolution rates, response times, and customer satisfaction.",
  },
  {
    icon: Code2,
    title: "API & Webhooks",
    description:
      "Full REST API access and webhook support for custom integrations with your stack.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative border-t border-border px-6 py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-16">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-3 text-sm text-[color:var(--text-secondary)]"
          >
            Features
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="max-w-2xl text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Everything your support team needs, automated
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="h-full rounded-lg border border-border bg-card p-6 transition-colors duration-200 hover:bg-[color:var(--card-elevated)]">
                <feature.icon className="mb-4 size-5 text-[color:var(--text-secondary)]" />
                <h3 className="mb-2 text-base font-medium text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
