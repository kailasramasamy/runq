import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Clock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

interface ComingSoonProps {
  title: string;
  subtitle: string;
  launchDate: string;
  features: Feature[];
  moduleName: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export function ComingSoon({ title, subtitle, launchDate, features, moduleName }: ComingSoonProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log(`[${moduleName}] Notify email:`, email);
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary-600/10 blur-[120px]" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <Badge variant="warning" className="mb-6 gap-2">
              <Clock className="size-3" />
              Coming {launchDate}
            </Badge>
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="font-display text-5xl md:text-6xl text-white mb-6 leading-tight"
          >
            {title}
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed"
          >
            {subtitle}
          </motion.p>
        </div>
      </section>

      {/* Feature Preview */}
      <section className="section bg-zinc-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <motion.h2
            variants={fadeUp}
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-2xl font-semibold text-center text-white mb-12"
          >
            What&apos;s coming
          </motion.h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={cn(
                  'gradient-border p-6',
                  'flex flex-col gap-4',
                )}
              >
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

      {/* Email Capture */}
      <section className="section">
        <div className="max-w-lg mx-auto px-6 text-center">
          <motion.div
            variants={fadeUp}
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 rounded-xl bg-primary-950 flex items-center justify-center text-primary-400 mx-auto mb-6">
              <Mail className="size-5" />
            </div>

            <h2 className="text-2xl font-semibold text-white mb-2">
              Get notified when we launch
            </h2>
            <p className="text-zinc-400 text-sm mb-8">
              Be the first to know. No spam, just the launch announcement.
            </p>

            {submitted ? (
              <div className="rounded-xl bg-emerald-950 border border-emerald-800 px-6 py-4 text-emerald-300 text-sm font-medium">
                You&apos;re on the list. We&apos;ll reach out when {moduleName} is ready.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button type="submit" size="md">
                  Notify me
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
