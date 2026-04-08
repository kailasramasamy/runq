import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, HardDrive, Server, Zap, Smartphone, Database } from 'lucide-react';
import { NavLink } from '@/lib/router.tsx';
import { Button } from '@/components/ui/button';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

const SECURITY = [
  {
    icon: <Server className="size-5" />,
    title: 'India-hosted servers',
    description: 'Your data never leaves Indian soil. Hosted on AWS Mumbai (ap-south-1).',
  },
  {
    icon: <Lock className="size-5" />,
    title: 'AES-256 encryption',
    description: 'Data encrypted at rest and in transit. Every connection is TLS 1.3.',
  },
  {
    icon: <HardDrive className="size-5" />,
    title: 'Daily backups',
    description: 'Point-in-time recovery with 30-day retention. Your books are always safe.',
  },
  {
    icon: <Shield className="size-5" />,
    title: 'SOC 2 compliance roadmap',
    description: 'Actively working toward SOC 2 Type II. Security is not an afterthought.',
  },
];

const TECH = [
  {
    icon: <Zap className="size-5" />,
    title: 'Modern stack',
    description: 'React 19, Node.js, PostgreSQL, and Redis. Fast by design, not by accident.',
  },
  {
    icon: <Smartphone className="size-5" />,
    title: 'Mobile-first architecture',
    description: 'Every screen works on a phone. Review invoices on the way to a client meeting.',
  },
  {
    icon: <Database className="size-5" />,
    title: 'Real-time sync',
    description: 'Changes propagate instantly across all users on the account. No refresh needed.',
  },
];

export default function About() {
  useEffect(() => { document.title = 'About — runQ'; }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Story */}
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary-600/8 blur-[140px]" />
        </div>
        <div className="max-w-4xl mx-auto px-6 relative">
          <motion.h1 custom={0} variants={fadeUp} initial="hidden" animate="visible"
            className="font-display text-5xl md:text-6xl text-white mb-8 leading-tight max-w-3xl">
            Built by business owners,<br />
            <span className="gradient-text italic">for business owners</span>
          </motion.h1>
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
            className="prose prose-invert max-w-2xl space-y-5 text-zinc-400 text-lg leading-relaxed">
            <p>
              runQ was born from frustration. We ran businesses that grew to dozens of employees
              and crores in revenue — and we were still copy-pasting invoice numbers into Excel.
            </p>
            <p>
              The ERPs on the market were built for chartered accountants, not for founders.
              They were clunky, required weeks of training, and cost more to set up than to just
              hire a full-time accountant. So we built what we wished existed.
            </p>
            <p>
              runQ is designed for the person who has to approve payroll, review outstanding invoices,
              and send a vendor payment — before the morning standup. It should just work.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Data Safety */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }} className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 flex items-center justify-center text-emerald-400">
                <Shield className="size-5" />
              </div>
              <h2 className="font-display text-4xl text-white">Your data is yours</h2>
            </div>
            <p className="text-zinc-400 max-w-2xl">
              We hold your financial data to the highest standard. Here's what that means in practice.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {SECURITY.map((item, i) => (
              <motion.div key={item.title} custom={i} variants={fadeUp} initial="hidden"
                whileInView="visible" viewport={{ once: true }}
                className="flex gap-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="w-10 h-10 rounded-lg bg-emerald-950 flex items-center justify-center text-emerald-400 shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">{item.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div custom={4} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }}
            className="mt-5 rounded-2xl bg-emerald-950/40 border border-emerald-900 p-5 flex items-center gap-4">
            <Shield className="size-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">
              <strong>99.9% uptime SLA</strong> — backed by redundant infrastructure. Planned maintenance is always off-peak and announced 48 hours in advance.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Tech highlights */}
      <section className="section">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true }} className="mb-12">
            <h2 className="font-display text-4xl text-white mb-3">Built to last</h2>
            <p className="text-zinc-400 max-w-xl">
              Boring, proven technology — chosen for reliability, not hype.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TECH.map((item, i) => (
              <motion.div key={item.title} custom={i} variants={fadeUp} initial="hidden"
                whileInView="visible" viewport={{ once: true }}
                className="gradient-border p-6 flex flex-col gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-950 flex items-center justify-center text-primary-400">
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">{item.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <h2 className="font-display text-4xl text-white mb-4">Want to learn more?</h2>
            <p className="text-zinc-400 mb-8">We love talking to founders. No pitch decks, just a real conversation.</p>
            <NavLink to="/contact">
              <Button size="lg">Get in touch</Button>
            </NavLink>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
