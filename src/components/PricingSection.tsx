"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const pricingPlans = [
  {
    name: "Starter",
    price: { monthly: 49, annual: 39 },
    description: "For small teams getting started",
    features: [
      "1 AI bot",
      "500 conversations/month",
      "Email escalation",
      "Basic analytics",
      "Email support",
      "7-day chat history",
    ],
    cta: "Start free trial",
    highlighted: false,
  },
  {
    name: "Professional",
    price: { monthly: 149, annual: 119 },
    description: "For growing support teams",
    features: [
      "3 AI bots",
      "5,000 conversations/month",
      "Live agent handoff",
      "Advanced analytics",
      "API access",
      "Unlimited chat history",
      "Priority support",
      "Custom integrations",
    ],
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: null,
    description: "For large organizations",
    features: [
      "Unlimited AI bots",
      "Unlimited conversations",
      "Dedicated agent dashboard",
      "SLA guarantees",
      "SSO & SAML",
      "White-label option",
      "Custom training",
      "Dedicated account manager",
    ],
    cta: "Contact sales",
    highlighted: false,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="relative border-t border-border px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16">
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
            className="mb-8 text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Simple, transparent pricing
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <span
              className={`text-sm ${
                !isAnnual ? "text-foreground" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setIsAnnual(!isAnnual)}
              aria-label="Toggle annual pricing"
              className="relative h-6 w-11 rounded-full border border-border bg-card transition-all"
            >
              <motion.div
                className="absolute top-0.5 h-5 w-5 rounded-full bg-foreground"
                animate={{ left: isAnnual ? "22px" : "2px" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
            <span
              className={`text-sm ${
                isAnnual ? "text-foreground" : "text-[color:var(--text-secondary)]"
              }`}
            >
              Annual
            </span>
            {isAnnual ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded border border-[color:var(--status-success)]/20 bg-[color:var(--status-success)]/10 px-2 py-1 text-xs text-[color:var(--status-success)]"
              >
                Save 20%
              </motion.span>
            ) : null}
          </motion.div>
        </div>

        <div className="grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <div
                className={`flex h-full flex-col rounded-lg border border-border p-6 ${
                  plan.highlighted
                    ? "bg-[color:var(--card-elevated)]"
                    : "bg-card"
                }`}
              >
                <div className="mb-6">
                  <h3 className="mb-1 text-base font-medium text-foreground">
                    {plan.name}
                  </h3>
                  <p className="mb-4 text-sm text-[color:var(--text-secondary)]">
                    {plan.description}
                  </p>
                  <div className="flex items-baseline gap-1">
                    {plan.price ? (
                      <>
                        <span className="text-3xl font-bold text-foreground">
                          ${isAnnual ? plan.price.annual : plan.price.monthly}
                        </span>
                        <span className="text-sm text-[color:var(--text-secondary)]">
                          /month
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl font-bold text-foreground">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                <ul className="mb-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--text-secondary)]" />
                      <span className="text-[color:var(--text-secondary)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.highlighted ? "default" : "outline"}
                  className={`w-full rounded-lg ${
                    plan.highlighted
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
                  }`}
                >
                  {plan.cta}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
