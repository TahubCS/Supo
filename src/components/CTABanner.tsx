"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CTABanner() {
  return (
    <section className="relative border-t border-border px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-[color:var(--text-secondary)]">
            Join thousands of teams using Supo to deliver exceptional customer
            support at scale.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="default"
              className="group rounded-lg bg-foreground px-6 py-2.5 text-sm text-background hover:bg-foreground/90"
            >
              <Link href="/sign-up">
                Start free trial
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="default"
              className="rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground"
            >
              <Link href="/sign-up/team">Contact sales</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-[color:var(--text-tertiary)]">
            No credit card required · 14-day free trial
          </p>
        </motion.div>
      </div>
    </section>
  );
}
