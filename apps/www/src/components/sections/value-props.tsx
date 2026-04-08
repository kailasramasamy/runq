import { motion } from 'framer-motion';
import { Zap, Brain, Smartphone, IndianRupee, type LucideIcon } from 'lucide-react';

interface Prop {
  icon: LucideIcon;
  title: string;
  description: string;
}

const props: Prop[] = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description:
      'Create GST-compliant invoices in under 30 seconds. No lag, no loading screens.',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description:
      'Auto-categorize transactions, smart vendor matching, and intelligent payment reminders.',
  },
  {
    icon: Smartphone,
    title: 'Mobile First',
    description:
      'Full ERP on your phone. Create invoices, approve payments, check reports — anywhere.',
  },
  {
    icon: IndianRupee,
    title: '10x Cheaper',
    description:
      'Free forever plan. Paid plans start at ₹999/mo — a fraction of legacy ERP costs.',
  },
];

export function ValueProps() {
  return (
    <section className="section">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {props.map((prop, i) => (
            <motion.div
              key={prop.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="gradient-border p-6 flex flex-col gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-950 border border-primary-800 flex items-center justify-center shrink-0">
                <prop.icon className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100 mb-1">
                  {prop.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {prop.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
