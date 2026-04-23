import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

export function ClosingCTA() {
  return (
    <section className="px-5 py-20 sm:px-6 lg:py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        className="mx-auto max-w-5xl rounded-[2rem] border border-border/70 bg-card/92 px-6 py-12 text-center shadow-[0_28px_100px_-60px_rgba(19,24,56,0.45)] sm:px-10 sm:py-16"
      >
        <h2 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Build your support system before the queue becomes the bottleneck.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">
          Start with one team, one workflow, and one source of truth for AI resolution and
          human handoff.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button className="h-11 rounded-full px-6">
            Get started
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-full border-border/70 bg-background/80 px-6"
          >
            Book a walkthrough
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
