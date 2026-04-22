import { motion } from 'motion/react';
import { Button } from './Button';

export function CTABanner() {
  return (
    <section className="relative py-24 px-6 overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-linear-to-r from-[--primary] via-[#5558E3] to-[--accent]" />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-black tracking-tight text-white mb-8"
        >
          Start resolving tickets with AI today.
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <Button
            variant="outline"
            size="lg"
            className="bg-white! text-[--primary]! hover:bg-white/90! border-0! mb-6"
          >
            Get started free →
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-sm text-white/80"
        >
          No credit card required · 14-day free trial · Cancel anytime
        </motion.p>
      </div>

      {/* Decorative blur circles */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-white opacity-10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </section>
  );
}
