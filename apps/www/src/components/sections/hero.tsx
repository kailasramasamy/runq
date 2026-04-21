import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BrowserFrame } from '@/components/ui/browser-frame';
import { useRouter } from '@/lib/router';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: 'easeOut' as const },
});

export function Hero() {
  const { navigate } = useRouter();
  return (
    <section className="relative flex items-center justify-center min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Radial glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 40%, oklch(0.5 0.2 264 / 0.18) 0%, transparent 70%)',
          }}
          className="absolute inset-0"
        />
        <div
          style={{
            background:
              'radial-gradient(ellipse 40% 30% at 60% 30%, oklch(0.5 0.18 290 / 0.12) 0%, transparent 60%)',
          }}
          className="absolute inset-0"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.div {...fadeUp(0)}>
          <span className="inline-block mb-6 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide bg-primary-950 text-primary-300 border border-primary-800">
            Now in early access — free forever plan
          </span>
        </motion.div>

        <motion.h1
          {...fadeUp(0.1)}
          className="font-display text-5xl sm:text-6xl md:text-7xl leading-[1.08] tracking-tight text-zinc-50"
        >
          Run your business,
          <br />
          <span className="gradient-text">not your books.</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.2)}
          className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-zinc-400 leading-relaxed"
        >
          The modern ERP built for Indian businesses. GST invoicing, bank
          reconciliation, vendor management — powered by AI, built for speed.
        </motion.p>

        <motion.div
          {...fadeUp(0.3)}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => navigate('/get-started')}>
            Get Started Free
          </Button>
          <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={() => navigate('/finance')}>
            See How It Works
          </Button>
        </motion.div>

        <motion.p
          {...fadeUp(0.4)}
          className="mt-6 text-sm text-zinc-500"
        >
          No credit card required · Free forever plan · Setup in 2 minutes
        </motion.p>

        <motion.div
          {...fadeUp(0.5)}
          className="mt-14"
        >
          <BrowserFrame
            src="/images/dashboard.jpg"
            alt="runQ Dashboard — cash position, receivables, payables, aging charts"
            className="glow"
          />
        </motion.div>
      </div>
    </section>
  );
}
