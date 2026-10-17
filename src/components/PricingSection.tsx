"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Everything here ships today; keep this list in sync with the product.
const alphaFeatures = [
  "AI answers grounded in your docs, with citations",
  "Knowledge from articles, PDF and Word files, websites and GitHub",
  "Human handoff to a shared inbox with SLAs and business hours",
  "Email channel and a public help center",
  "CSAT ratings and analytics with CSV export",
  "REST API, signed webhooks and a widget SDK",
  "Team roles: admin, developer and agent",
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative border-t border-border px-6 py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-2">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-3 text-sm text-[color:var(--text-secondary)]"
          >
            Pricing
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Free while Supo is in alpha
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="max-w-md text-base text-[color:var(--text-secondary)]"
          >
            Every feature is included. Usage limits keep the service fair for everyone during the alpha.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="flex flex-col rounded-lg border border-border bg-[color:var(--card-elevated)] p-6"
        >
          <div className="mb-6">
            <h3 className="mb-1 text-base font-medium text-foreground">Alpha</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-foreground">$0</span>
              <span className="text-sm text-[color:var(--text-secondary)]">/month</span>
            </div>
          </div>

          <ul className="mb-6 flex-1 space-y-3">
            {alphaFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--text-secondary)]" />
                <span className="text-[color:var(--text-secondary)]">{feature}</span>
              </li>
            ))}
          </ul>

          <Button asChild className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90">
            <Link href="/sign-up">Get started free</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
