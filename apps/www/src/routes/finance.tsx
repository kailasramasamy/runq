import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  CreditCard,
  ReceiptText,
  Landmark,
  BookOpen,
  Users,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrowserFrame, PhoneFrame } from '@/components/ui/browser-frame';
import { NavLink } from '@/lib/router.tsx';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

const FEATURES = [
  {
    icon: <FileText className="size-5" />,
    title: 'GST Invoicing',
    description: 'Generate GST-compliant invoices in seconds. CGST, SGST, IGST — auto-calculated based on state.',
  },
  {
    icon: <CreditCard className="size-5" />,
    title: 'Accounts Payable',
    description: 'Track vendor bills, schedule payments, and never miss a due date again.',
  },
  {
    icon: <ReceiptText className="size-5" />,
    title: 'Accounts Receivable',
    description: 'Follow up on outstanding invoices with automated dunning and collections workflows.',
  },
  {
    icon: <Landmark className="size-5" />,
    title: 'Bank Reconciliation',
    description: 'Match transactions to your books automatically. Close your books 10x faster.',
  },
  {
    icon: <BookOpen className="size-5" />,
    title: 'General Ledger',
    description: 'Real-time double-entry accounting. Every rupee tracked, every entry auditable.',
  },
  {
    icon: <Users className="size-5" />,
    title: 'Vendor & CA Portals',
    description: 'Share read-only access with your CA or vendors — no extra logins needed.',
  },
];

const HIGHLIGHTS = [
  'GST-ready from day one',
  'Bank sync via CSV or direct import',
  'Tally XML export for CA handoff',
  'Real-time P&L and cash position',
  'Multi-user with role-based access',
];

const SHOWCASES = [
  {
    badge: 'Invoice Detail',
    title: 'Every rupee accounted for',
    description: 'Full GST breakdown with CGST, SGST, IGST. Payment history, UPI payment links, print-ready PDF — all on one screen.',
    features: ['Line-item tax breakdown with HSN/SAC', 'Payment tracking & receipt history', 'One-click UPI link & PDF download'],
    src: '/images/invoice-detail.webp',
    alt: 'runQ invoice detail with GST breakdown, payment tracking, and UPI link',
    frame: 'browser' as const,
  },
  {
    badge: 'Invoicing',
    title: 'Track every invoice at a glance',
    description: 'See all invoices with real-time status — draft, sent, paid, overdue. Filter by customer, date, or status. Export to CSV for your CA.',
    features: ['GST-compliant with CGST/SGST/IGST', 'Overdue alerts & payment tracking', 'One-click CSV export'],
    src: '/images/invoice-list.webp',
    alt: 'Invoice list with GST status tracking',
    frame: 'browser' as const,
  },
  {
    badge: 'Reconciliation',
    title: 'Close your books 10x faster',
    description: 'Import bank statements, auto-match transactions to invoices and bills. No more manual ticking in spreadsheets.',
    features: ['Auto-match by amount & reference', 'Handles partial payments', 'Reconciliation report for auditors'],
    src: '/images/bank-reconciliation.webp',
    alt: 'Bank reconciliation matching interface',
    frame: 'browser' as const,
  },
  {
    badge: 'Collaboration',
    title: 'Share with your CA — no login needed',
    description: 'Generate a secure read-only portal link. Your CA gets trial balance, reports, and Tally export without creating an account.',
    features: ['Read-only access for CAs & vendors', 'No extra seats or licenses', 'Secure tokenized links'],
    src: '/images/vendor-portal.webp',
    alt: 'Vendor portal with read-only access',
    frame: 'browser' as const,
  },
  {
    badge: 'AI Assistant',
    title: 'Ask anything about your business',
    description: 'Chat with your data in plain English. "How much does Vendor X owe us?" or "Show overdue invoices from last month" — get instant answers without digging through reports.',
    features: ['Natural language queries on your live data', 'Instant insights — no report building needed', 'Smart suggestions for payments & collections'],
    src: '/images/ai-assistant.webp',
    alt: 'runQ AI assistant answering business queries in natural language',
    frame: 'browser' as const,
  },
  {
    badge: 'Mobile',
    title: 'Your full ERP — in your pocket',
    description: 'Every screen is mobile-optimized. Check outstanding balances, approve payments, or browse customers from your phone.',
    features: ['Compact card views on mobile', 'Touch-friendly actions', 'Works offline for viewing'],
    src: '/images/customer-list-mobile.webp',
    alt: 'runQ customer list on mobile — compact card view',
    frame: 'phone' as const,
  },
  {
    badge: 'Speed',
    title: 'Invoice in 30 seconds',
    description: 'Save templates for repeat customers. Enter quantities, hit generate — done. Share via WhatsApp or UPI payment link instantly.',
    features: ['One-click invoice generation', 'Auto-calculated GST', 'WhatsApp + UPI sharing', 'Recurring invoice support'],
    src: '/images/quick-invoice-mobile.webp',
    alt: 'Quick invoice template — generate invoices in one click',
    frame: 'phone' as const,
  },
];

export default function Finance() {
  useEffect(() => { document.title = 'Finance & Accounting — runQ'; }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary-600/10 blur-[140px]" />
        </div>
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="max-w-3xl mb-16">
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
              <Badge variant="primary" className="mb-6">Finance Module</Badge>
            </motion.div>
            <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="visible"
              className="font-display text-5xl md:text-6xl text-white mb-6 leading-tight">
              Finance &amp; Accounting,{' '}
              <span className="gradient-text italic">simplified</span>
            </motion.h1>
            <motion.p custom={2} variants={fadeUp} initial="hidden" animate="visible"
              className="text-lg text-zinc-400 leading-relaxed mb-8 max-w-2xl">
              GST-compliant invoicing, automated bank reconciliation, and real-time P&amp;L —
              built for Indian SMEs who want clarity without the complexity.
            </motion.p>
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
              className="flex flex-wrap gap-x-6 gap-y-2 mb-12">
              {HIGHLIGHTS.map((h) => (
                <span key={h} className="flex items-center gap-2 text-sm text-zinc-300">
                  <CheckCircle2 className="size-4 text-primary-400 shrink-0" />{h}
                </span>
              ))}
            </motion.div>
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible" className="flex gap-3">
              <NavLink to="/get-started">
                <Button size="lg">Start for free <ArrowRight className="size-4" /></Button>
              </NavLink>
              <NavLink to="/pricing">
                <Button variant="secondary" size="lg">See pricing</Button>
              </NavLink>
            </motion.div>
          </div>
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
            <BrowserFrame
              src="/images/dashboard.webp"
              alt="runQ Dashboard — cash position, receivables, payables, aging charts"
              className="glow"
            />
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }} className="text-center mb-16">
            <h2 className="font-display text-4xl text-white mb-4">Everything your finance team needs</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">Six core modules, one connected platform. No bolt-ons, no hidden fees.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div key={feature.title} custom={i} variants={fadeUp} initial="hidden"
                whileInView="visible" viewport={{ once: true }}
                className="gradient-border p-6 flex flex-col gap-4 hover:bg-zinc-800/20 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary-950 flex items-center justify-center text-primary-400">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">{feature.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot Showcase — alternating rows */}
      <section className="section">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }} className="text-center mb-20">
            <h2 className="font-display text-4xl text-white mb-4">Built for clarity</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Every screen designed to give you answers fast — not make you dig through menus.
            </p>
          </motion.div>

          <div className="space-y-24">
            {SHOWCASES.map((item, i) => {
              const isReversed = i % 2 === 1;
              const isPhone = item.frame === 'phone';
              return (
                <div key={item.title} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center ${isReversed ? 'lg:[direction:rtl]' : ''}`}>
                  {/* Text */}
                  <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
                    viewport={{ once: true }} className={isReversed ? 'lg:[direction:ltr]' : ''}>
                    <Badge variant="primary" className="mb-4">{item.badge}</Badge>
                    <h3 className="font-display text-3xl sm:text-4xl text-white mb-4">{item.title}</h3>
                    <p className="text-zinc-400 leading-relaxed mb-6">{item.description}</p>
                    <ul className="space-y-2.5">
                      {item.features.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-300">
                          <CheckCircle2 className="size-4 text-primary-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </motion.div>

                  {/* Screenshot */}
                  <motion.div custom={1} variants={fadeUp} initial="hidden" whileInView="visible"
                    viewport={{ once: true }} className={`${isReversed ? 'lg:[direction:ltr]' : ''} ${isPhone ? 'flex justify-center' : ''}`}>
                    {isPhone ? (
                      <PhoneFrame src={item.src} alt={item.alt} />
                    ) : (
                      <BrowserFrame src={item.src} alt={item.alt} className="glow" />
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <h2 className="font-display text-4xl text-white mb-4">Ready to close your books on time?</h2>
            <p className="text-zinc-400 mb-8">Start free. No credit card required. Up and running in under 10 minutes.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <NavLink to="/get-started">
                <Button size="lg">Get started free <ArrowRight className="size-4" /></Button>
              </NavLink>
              <NavLink to="/contact">
                <Button variant="secondary" size="lg">Talk to sales</Button>
              </NavLink>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
