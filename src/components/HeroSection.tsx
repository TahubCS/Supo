import Image from 'next/image';
import { motion } from 'motion/react';
import { Button } from './Button';
import { MessageCircle, Zap, Users } from 'lucide-react';

export function HeroSection() {
  const avatars = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      {/* Radial gradient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-150 h-150 bg-[--primary] opacity-20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl mb-8"
        >
          <span className="text-[--accent] text-xl">✦</span>
          <span className="text-sm text-[--foreground]">
            Now with GPT-4o · 99.9% Uptime
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-6xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tight"
          style={{ letterSpacing: '-0.03em' }}
        >
          Support that never{' '}
          <span className="bg-linear-to-r from-[--primary] to-[--accent] bg-clip-text text-transparent">
            sleeps.
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xl text-[--muted-foreground] max-w-3xl mx-auto mb-10"
          style={{ lineHeight: 1.7 }}
        >
          Deploy an AI support agent that resolves 80% of tickets autonomously — and hands off the rest to your team in real time.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <Button variant="primary" size="lg">
            Start Free Trial
          </Button>
          <Button variant="outline" size="lg">
            View Live Demo →
          </Button>
        </motion.div>

        {/* Social Proof */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex items-center justify-center gap-3 mb-16"
        >
          <div className="flex -space-x-2">
            {avatars.map((avatar, i) => (
              <Image
                key={i}
                src={avatar}
                alt=""
                width={40}
                height={40}
                className="w-10 h-10 rounded-full border-2 border-[--background]"
              />
            ))}
          </div>
          <p className="text-sm text-[--muted-foreground]">
            Trusted by 2,400+ support teams
          </p>
        </motion.div>

        {/* Hero Visual - Floating Chat Widget Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, type: 'spring' }}
          className="relative max-w-2xl mx-auto"
        >
          {/* Chat Widget */}
          <div className="relative bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl rounded-3xl p-6 shadow-[0_0_48px_rgba(99,102,241,0.4)]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[--glass-border]">
              <div className="w-10 h-10 rounded-full bg-linear-to-br from-[--primary] to-[--accent] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm">AI Support Assistant</h4>
                <div className="flex items-center gap-1.5 text-xs text-[--muted-foreground]">
                  <span className="w-2 h-2 rounded-full bg-[--status-success]" />
                  Online
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              <div className="flex justify-start">
                <div className="bg-linear-to-br from-[--primary] to-[#5558E3] text-white px-4 py-3 rounded-2xl max-w-[80%]">
                  <p className="text-sm">Hi! How can I help you today?</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-[--glass-background] border border-[--glass-border] px-4 py-3 rounded-2xl max-w-[80%]">
                  <p className="text-sm">I need help resetting my password</p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-linear-to-br from-[--primary] to-[#5558E3] text-white px-4 py-3 rounded-2xl max-w-[80%]">
                  <p className="text-sm">I&apos;ll send you a reset link right away.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Stat Chips */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-4 -left-4 bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl rounded-xl px-4 py-2 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[--accent]" />
              <span className="text-sm">2.3s avg. response</span>
            </div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute -bottom-4 -right-4 bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl rounded-xl px-4 py-2 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[--status-success]" />
              <span className="text-sm">94% resolved</span>
            </div>
          </motion.div>

          <motion.div
            animate={{ x: [-5, 5, -5] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute top-1/2 -left-12 bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl rounded-xl px-4 py-2 shadow-lg hidden lg:block"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[--status-success] animate-pulse" />
              <span className="text-sm">12 agents online</span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </section>
  );
}
