import Image from 'next/image';
import { motion } from 'motion/react';
import { Card } from './Card';
import { Star } from 'lucide-react';

const testimonials = [
  {
    quote: "SupportAI reduced our ticket volume by 75% in the first month. Our team can now focus on complex issues.",
    author: "Sarah Chen",
    role: "Head of Support",
    company: "TechCorp",
    logo: "TC",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
  },
  {
    quote: "The API integration was seamless. We had our chatbot live in production within 2 hours.",
    author: "Michael Rodriguez",
    role: "CTO",
    company: "StartupXYZ",
    logo: "SX",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
  },
  {
    quote: "Best support platform we've used. The AI handoff to human agents is absolutely seamless.",
    author: "Emily Thompson",
    role: "Customer Success Lead",
    company: "CloudFlow",
    logo: "CF",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100",
  },
  {
    quote: "Our CSAT scores improved by 30% after implementing SupportAI. Customers love the instant responses.",
    author: "David Kim",
    role: "VP of Operations",
    company: "DataScale",
    logo: "DS",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative py-24 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Rating Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-1 mb-3">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-[--primary] text-[--primary]" />
            ))}
          </div>
          <p className="text-lg text-[--muted-foreground]">
            4.9 / 5 across 800+ reviews
          </p>
        </motion.div>

        {/* Testimonials Scroll */}
        <div className="relative">
          <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-hide">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="shrink-0 w-100 snap-start"
              >
                <Card className="p-6 h-full flex flex-col">
                  {/* Company Logo */}
                  <div className="w-12 h-12 rounded-lg bg-linear-to-br from-[--primary] to-[--accent] flex items-center justify-center mb-4">
                    <span className="text-white font-bold text-sm">{testimonial.logo}</span>
                  </div>

                  {/* Quote */}
                  <p className="text-[--foreground] mb-6 flex-1 leading-relaxed">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-3">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.author}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full border-2 border-[--glass-border]"
                    />
                    <div>
                      <h4 className="text-sm">{testimonial.author}</h4>
                      <p className="text-xs text-[--muted-foreground]">
                        {testimonial.role} at {testimonial.company}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Gradient Fade on edges */}
          <div className="absolute top-0 left-0 bottom-6 w-12 bg-linear-to-r from-[--background] to-transparent pointer-events-none" />
          <div className="absolute top-0 right-0 bottom-6 w-12 bg-linear-to-l from-[--background] to-transparent pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
