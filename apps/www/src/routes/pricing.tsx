import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, type AccordionItem } from '@/components/ui/accordion';
import { NavLink } from '@/lib/router';
import { cn } from '@/lib/utils';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
  }),
};

interface Plan {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    monthlyPrice: null,
    annualPrice: null,
    description: 'Everything you need to get started. No card needed.',
    features: [
      '1 user',
      '50 invoices per month',
      'Finance module',
      'CSV export',
      'Community support',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Growth',
    monthlyPrice: 999,
    annualPrice: 799,
    description: 'For teams that invoice daily and need automation.',
    features: [
      '5 users',
      'Unlimited invoices',
      'Finance + upcoming modules',
      'CSV + Tally export',
      'Email support',
      'AI features',
    ],
    cta: 'Start free trial',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    monthlyPrice: 2499,
    annualPrice: 1999,
    description: 'For businesses that need control, compliance, and scale.',
    features: [
      'Unlimited users',
      'All modules',
      'API access',
      'Priority support',
      'SSO (SAML)',
      'Dedicated account manager',
    ],
    cta: 'Talk to sales',
    highlighted: false,
  },
];

const FAQ_ITEMS: AccordionItem[] = [
  {
    id: 'change-plans',
    question: 'Can I change plans later?',
    answer: 'Yes — you can upgrade or downgrade at any time. Changes take effect immediately, and billing is prorated.',
  },
  {
    id: 'payment-methods',
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards, UPI, and net banking via Razorpay. Annual plans can also be paid via bank transfer.',
  },
  {
    id: 'free-trial',
    question: 'Is there a free trial for paid plans?',
    answer: "Yes. Growth and Enterprise plans come with a 14-day free trial — no credit card required. You'll be prompted to add payment details at the end of the trial.",
  },
  {
    id: 'invoice-limit',
    question: 'What happens when I exceed the invoice limit?',
    answer: "On the Starter plan, invoice creation is paused when you hit 50 for the month. You'll get a notification and can upgrade instantly to continue.",
  },
  {
    id: 'annual-discount',
    question: 'Do you offer discounts for annual billing?',
    answer: 'Yes. Annual billing saves you ~20% compared to monthly. The toggle above lets you see exact prices.',
  },
  {
    id: 'data-export',
    question: 'Can I export my data if I leave?',
    answer: 'Always. You own your data. Export everything — invoices, contacts, ledger entries — as CSV or Tally XML at any time, for free.',
  },
];

function PriceDisplay({ plan, annual }: { plan: Plan; annual: boolean }) {
  if (!plan.monthlyPrice) {
    return (
      <div className="mb-6">
        <span className="text-4xl font-bold text-white">Free</span>
        <span className="text-zinc-500 text-sm ml-2">forever</span>
      </div>
    );
  }

  const price = annual ? plan.annualPrice! : plan.monthlyPrice;
  return (
    <div className="mb-6">
      <span className="text-zinc-500 text-lg mr-1">₹</span>
      <span className="text-4xl font-bold text-white">{price.toLocaleString('en-IN')}</span>
      <span className="text-zinc-500 text-sm ml-1">/mo</span>
      {annual && (
        <div className="text-xs text-emerald-400 mt-1">Billed annually — save 20%</div>
      )}
    </div>
  );
}

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  useEffect(() => { document.title = 'Pricing — runQ'; }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary-600/10 blur-[120px]" />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Badge variant="primary" className="mb-6">Pricing</Badge>
          </motion.div>
          <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="visible"
            className="font-display text-5xl md:text-6xl text-white mb-4">
            Simple, transparent pricing
          </motion.h1>
          <motion.p custom={2} variants={fadeUp} initial="hidden" animate="visible"
            className="text-zinc-400 text-lg mb-10">
            No hidden fees. No per-feature upsells. Start free, grow on your terms.
          </motion.p>

          {/* Monthly / Annual toggle */}
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
            className="inline-flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1.5">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                !annual ? 'bg-primary-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                annual ? 'bg-primary-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              Annual
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5',
                annual ? 'bg-white/20 text-white' : 'bg-emerald-900 text-emerald-300',
              )}>
                -20%
              </span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className={cn(
                'relative flex flex-col rounded-2xl p-6',
                plan.highlighted
                  ? 'bg-primary-950 border-2 border-primary-600 glow'
                  : 'bg-zinc-900 border border-zinc-800',
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-zinc-400">{plan.description}</p>
              </div>

              <PriceDisplay plan={plan} annual={annual} />

              <NavLink to={plan.name === 'Enterprise' ? '/contact' : '/get-started'}>
                <Button
                  variant={plan.highlighted ? 'primary' : 'secondary'}
                  className="w-full mb-6"
                >
                  {plan.cta}
                  <ArrowRight className="size-4" />
                </Button>
              </NavLink>

              <ul className="flex flex-col gap-2.5 mt-auto">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <Check className="size-4 text-primary-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }} className="text-center mb-12">
            <h2 className="font-display text-4xl text-white mb-3">Frequently asked questions</h2>
            <p className="text-zinc-400">Can't find an answer? <NavLink to="/contact" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">Reach out</NavLink> and we'll reply within a day.</p>
          </motion.div>
          <motion.div custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Accordion items={FAQ_ITEMS} />
          </motion.div>
        </div>
      </section>
    </div>
  );
}
