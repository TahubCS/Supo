"use client";

import { motion } from "motion/react";

const testimonials = [
  {
    quote:
      "Supo reduced our ticket volume by 75% in the first month. Our team can now focus on complex issues.",
    author: "Sarah Chen",
    role: "Head of Support",
    company: "TechCorp",
  },
  {
    quote:
      "The API integration was seamless. We had our chatbot live in production within 2 hours.",
    author: "Michael Rodriguez",
    role: "CTO",
    company: "StartupXYZ",
  },
  {
    quote:
      "Best support platform we've used. The AI handoff to human agents is absolutely seamless.",
    author: "Emily Thompson",
    role: "Customer Success Lead",
    company: "CloudFlow",
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative border-t border-border px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
            Testimonials
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Trusted by support teams worldwide
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                <p className="mb-6 flex-1 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div>
                  <h4 className="text-sm text-foreground">{testimonial.author}</h4>
                  <p className="text-xs text-[color:var(--text-tertiary)]">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
