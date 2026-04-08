import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export function CtaBanner() {
  return (
    <section className="section px-6">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative rounded-3xl overflow-hidden px-8 py-16 sm:px-16 text-center"
          style={{
            background: 'linear-gradient(135deg, oklch(0.4 0.18 264 / 0.25) 0%, oklch(0.4 0.18 290 / 0.25) 100%)',
          }}
        >
          {/* Border glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              boxShadow: 'inset 0 0 0 1px oklch(0.6 0.18 264 / 0.2)',
            }}
          />
          {/* Ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl"
            style={{
              background: 'radial-gradient(ellipse 60% 80% at 50% 0%, oklch(0.5 0.2 264 / 0.15) 0%, transparent 70%)',
            }}
          />

          <div className="relative z-10">
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-zinc-50 mb-4">
              Ready to modernize<br className="hidden sm:block" /> your business?
            </h2>
            <p className="text-zinc-400 text-lg mb-10 max-w-lg mx-auto">
              Join hundreds of Indian businesses already running on runQ.
            </p>
            <Button variant="primary" size="lg">
              Start Free Today →
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
