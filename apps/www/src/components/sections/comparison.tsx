import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Row {
  label: string;
  runq: boolean | string;
  tally: boolean | string;
  zoho: boolean | string;
  vyapar: boolean | string;
}

const rows: Row[] = [
  { label: 'Monthly Cost',        runq: 'Free / ₹999',  tally: '₹18,000/yr', zoho: '₹2,500/mo',  vyapar: '₹1,999/yr'  },
  { label: 'GST Compliant',       runq: true,   tally: true,    zoho: true,    vyapar: true   },
  { label: 'Bank Reconciliation', runq: true,   tally: true,    zoho: true,    vyapar: false  },
  { label: 'AI Features',         runq: true,   tally: false,   zoho: false,   vyapar: false  },
  { label: 'Mobile App',          runq: true,   tally: false,   zoho: true,    vyapar: true   },
  { label: 'Multi-user',          runq: true,   tally: true,    zoho: true,    vyapar: false  },
  { label: 'API Access',          runq: true,   tally: false,   zoho: true,    vyapar: false  },
  { label: 'Vendor Portal',       runq: true,   tally: false,   zoho: false,   vyapar: false  },
  { label: 'CA Portal',           runq: true,   tally: false,   zoho: false,   vyapar: false  },
];

const headers = ['Feature', 'runQ', 'Tally', 'Zoho Books', 'Vyapar'];

function Cell({ value, highlight }: { value: boolean | string; highlight: boolean }) {
  if (typeof value === 'string') {
    return (
      <span className={cn('text-sm font-medium', highlight ? 'text-primary-300' : 'text-zinc-300')}>
        {value}
      </span>
    );
  }
  return value ? (
    <Check className={cn('w-5 h-5 mx-auto', highlight ? 'text-emerald-400' : 'text-zinc-400')} />
  ) : (
    <X className="w-5 h-5 mx-auto text-zinc-700" />
  );
}

export function Comparison() {
  return (
    <section className="section">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl sm:text-4xl text-zinc-50 mb-4">
            Why businesses choose runQ
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Modern features at a fraction of the price. No compromises.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="overflow-x-auto rounded-2xl border border-zinc-800"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                {headers.map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-5 py-4 text-xs font-semibold uppercase tracking-wider',
                      i === 0
                        ? 'text-zinc-400 text-left w-44'
                        : i === 1
                        ? 'text-primary-400 text-center bg-primary-950/40'
                        : 'text-zinc-400 text-center',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={row.label}
                  className={cn(
                    'border-b border-zinc-800/60 last:border-0',
                    ri % 2 === 0 ? 'bg-zinc-900/40' : 'bg-transparent',
                  )}
                >
                  <td className="px-5 py-3.5 text-sm text-zinc-300 font-medium">{row.label}</td>
                  {(['runq', 'tally', 'zoho', 'vyapar'] as const).map((col) => (
                    <td
                      key={col}
                      className={cn(
                        'px-5 py-3.5 text-center',
                        col === 'runq' ? 'bg-primary-950/30' : '',
                      )}
                    >
                      <Cell value={row[col]} highlight={col === 'runq'} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
