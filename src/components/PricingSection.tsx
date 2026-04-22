import { motion } from 'motion/react';
import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Check, Zap } from 'lucide-react';

const pricingPlans = [
  {
    name: 'Starter',
    price: { monthly: 49, annual: 39 },
    description: 'For small teams getting started',
    features: [
      '1 AI bot',
      '500 conversations/month',
      'Email escalation',
      'Basic analytics',
      'Email support',
      '7-day chat history',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: { monthly: 149, annual: 119 },
    description: 'For growing support teams',
    features: [
      '3 AI bots',
      '5,000 conversations/month',
      'Live agent handoff',
      'Advanced analytics',
      'API access',
      'Unlimited chat history',
      'Priority support',
      'Custom integrations',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: null,
    description: 'For large organizations',
    features: [
      'Unlimited AI bots',
      'Unlimited conversations',
      'Dedicated agent dashboard',
      'SLA guarantees',
      'SSO & SAML',
      'White-label option',
      'Custom training',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="relative py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black tracking-tight mb-4"
          >
            Simple pricing. No surprises.
          </motion.h2>

          {/* Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-4 mt-8"
          >
            <span className={`text-sm ${!isAnnual ? 'text-[--foreground]' : 'text-[--muted-foreground]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-14 h-7 bg-[--glass-background] border border-[--glass-border] rounded-full transition-all"
            >
              <motion.div
                className="absolute top-0.5 w-6 h-6 bg-[--primary] rounded-full shadow-lg"
                animate={{ left: isAnnual ? '28px' : '2px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
            <span className={`text-sm ${isAnnual ? 'text-[--foreground]' : 'text-[--muted-foreground]'}`}>
              Annual
            </span>
            {isAnnual && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs px-2 py-1 bg-[--status-success]/20 text-[--status-success] rounded-full"
              >
                Save 20%
              </motion.span>
            )}
          </motion.div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              {plan.highlighted && (
                <div className="absolute -inset-px bg-linear-to-b from-[--primary] to-[--accent] rounded-2xl blur-sm opacity-75" />
              )}
              <Card
                className={`relative p-8 h-full flex flex-col ${
                  plan.highlighted ? 'border-[--primary]' : ''
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="px-3 py-1 bg-[--primary] text-white text-xs rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {plan.badge}
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl mb-2">{plan.name}</h3>
                  <p className="text-sm text-[--muted-foreground] mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    {plan.price ? (
                      <>
                        <span className="text-4xl font-black">
                          ${isAnnual ? plan.price.annual : plan.price.monthly}
                        </span>
                        <span className="text-[--muted-foreground]">/month</span>
                      </>
                    ) : (
                      <span className="text-4xl font-black">Custom</span>
                    )}
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className="w-5 h-5 text-[--primary] shrink-0 mt-0.5" />
                      <span className="text-[--muted-foreground]">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.highlighted ? 'primary' : 'outline'}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[--primary] opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </section>
  );
}
