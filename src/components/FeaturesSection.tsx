import { motion } from 'motion/react';
import { Card } from './Card';
import { Brain, ArrowUpRight, MessageSquare, Inbox, BarChart3, Code2 } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'AI Resolution Engine',
    description: 'Advanced language models trained on your knowledge base to resolve customer issues instantly.',
    color: 'text-[--primary]',
    bgColor: 'bg-[--primary]/10',
  },
  {
    icon: ArrowUpRight,
    title: 'Smart Escalation',
    description: 'Automatically detects when human intervention is needed and routes to the right team member.',
    color: 'text-[--accent]',
    bgColor: 'bg-[--accent]/10',
  },
  {
    icon: MessageSquare,
    title: 'Live Agent Handoff',
    description: 'Seamless transition from AI to human support with full conversation context preserved.',
    color: 'text-[--status-success]',
    bgColor: 'bg-[--status-success]/10',
  },
  {
    icon: Inbox,
    title: 'Multi-channel Inbox',
    description: 'Unified inbox for email, chat, and social media support across all your channels.',
    color: 'text-[--primary]',
    bgColor: 'bg-[--primary]/10',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Real-time insights into resolution rates, response times, and customer satisfaction.',
    color: 'text-[--accent]',
    bgColor: 'bg-[--accent]/10',
  },
  {
    icon: Code2,
    title: 'API & Webhooks',
    description: 'Full REST API access and webhook support for custom integrations with your stack.',
    color: 'text-[--status-success]',
    bgColor: 'bg-[--status-success]/10',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm text-[--accent] uppercase tracking-wider mb-4"
          >
            Platform Features
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-black tracking-tight"
          >
            Everything your support team needs, automated.
          </motion.h2>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-6 h-full hover:border-[--primary]/50 transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="mb-2">{feature.title}</h3>
                <p className="text-sm text-[--muted-foreground] leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[--accent] opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </section>
  );
}
