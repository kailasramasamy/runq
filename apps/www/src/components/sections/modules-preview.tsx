import { motion } from 'framer-motion';
import {
  Calculator, Users, BarChart3, Package, Handshake,
  FolderKanban, ShoppingCart, type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Module {
  icon: LucideIcon;
  title: string;
  features: string[];
  status: 'active' | 'soon';
  href?: string;
}

const modules: Module[] = [
  {
    icon: Calculator,
    title: 'Finance & Accounting',
    features: [
      'GST invoicing & e-invoicing',
      'AP / AR management',
      'Bank reconciliation',
      'General ledger & trial balance',
      'Vendor & CA portals',
    ],
    status: 'active',
    href: '/finance',
  },
  {
    icon: Package,
    title: 'Inventory & Warehouse',
    features: [
      'Stock tracking & transfers',
      'Multi-warehouse support',
      'Batch & serial management',
      'Reorder automation',
    ],
    status: 'soon',
  },
  {
    icon: ShoppingCart,
    title: 'Procurement',
    features: [
      'Purchase requisitions',
      'Vendor comparison & selection',
      'Purchase orders & GRN',
      '3-way matching',
    ],
    status: 'soon',
  },
  {
    icon: Users,
    title: 'Human Resources',
    features: [
      'Attendance & payroll',
      'Leave management',
      'Employee self-service',
      'Statutory compliance',
    ],
    status: 'soon',
    href: '/hr',
  },
  {
    icon: Handshake,
    title: 'CRM & Sales',
    features: [
      'Lead & deal pipeline',
      'Quotation to invoice flow',
      'Customer 360° view',
      'Sales team performance',
    ],
    status: 'soon',
  },
  {
    icon: FolderKanban,
    title: 'Projects',
    features: [
      'Task boards & timelines',
      'Time tracking & billing',
      'Resource allocation',
      'Project profitability',
    ],
    status: 'soon',
  },
  {
    icon: BarChart3,
    title: 'Business Intelligence',
    features: [
      'Real-time dashboards',
      'Custom report builder',
      'Cash flow forecasting',
      'AI-powered insights',
    ],
    status: 'soon',
    href: '/bi',
  },
];

export function ModulesPreview() {
  return (
    <section className="section">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl sm:text-4xl text-zinc-50 mb-4">
            One platform, every department
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Start with finance. Expand as you grow. Every module talks to every other — no data silos, no duplicate entry.
          </p>
        </motion.div>

        {/* Featured active module */}
        {modules.filter((m) => m.status === 'active').map((mod, i) => (
          <motion.a
            key={mod.title}
            href={mod.href}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="block mb-6 rounded-2xl border border-primary-700/50 bg-gradient-to-br from-primary-950/80 to-zinc-900 p-6 md:p-8 hover:border-primary-600/60 transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-900/60 border border-primary-700/50 flex items-center justify-center shrink-0">
                  <mod.icon className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-zinc-100">{mod.title}</h3>
                    <Badge variant="success">Live</Badge>
                  </div>
                  <p className="text-sm text-zinc-400 mt-0.5">Available now — free to start</p>
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-1.5 md:ml-auto">
                {mod.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </motion.a>
        ))}

        {/* Upcoming modules grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.filter((m) => m.status === 'soon').map((mod, i) => (
            <motion.div
              key={mod.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-5 gap-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <mod.icon className="w-5 h-5 text-zinc-400" />
                </div>
                <Badge variant="warning">Coming Soon</Badge>
              </div>

              <div>
                <h3 className="text-base font-semibold text-zinc-100 mb-2">
                  {mod.title}
                </h3>
                <ul className="space-y-1">
                  {mod.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-zinc-500">
                      <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {mod.href && (
                <a
                  href={mod.href}
                  className="mt-auto text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Learn more →
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
