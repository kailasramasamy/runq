import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useIntersection } from '@/hooks/use-intersection';

interface Metric {
  value: number;
  suffix: string;
  prefix?: string;
  label: string;
}

const metrics: Metric[] = [
  { value: 500,  suffix: '+',    label: 'Invoices generated' },
  { value: 50,   suffix: '+',    label: 'Businesses onboarded' },
  { value: 2,    suffix: 'Cr+',  prefix: '₹', label: 'Processed' },
  { value: 99.9, suffix: '%',    label: 'Uptime' },
];

function Counter({ value, suffix, prefix = '' }: { value: number; suffix: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, isVisible } = useIntersection(0.3);
  const started = useRef(false);

  useEffect(() => {
    if (!isVisible || started.current) return;
    started.current = true;

    const duration = 1400;
    const steps = 40;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current = Math.min(current + increment, value);
      setCount(current);
      if (current >= value) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isVisible, value]);

  const display = Number.isInteger(value)
    ? Math.round(count).toString()
    : count.toFixed(1);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{display}{suffix}
    </span>
  );
}

export function SocialProof() {
  return (
    <section className="relative section overflow-hidden">
      {/* Subtle grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(oklch(1 0 0 / 0.03) 1px, transparent 1px),
            linear-gradient(90deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.15 0.02 264) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl sm:text-4xl text-zinc-50 mb-4">
            Trusted by growing businesses
          </h2>
          <p className="text-zinc-400">Numbers that speak for themselves.</p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl sm:text-5xl font-bold gradient-text mb-2">
                <Counter value={m.value} suffix={m.suffix} prefix={m.prefix} />
              </div>
              <div className="text-sm text-zinc-400">{m.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
