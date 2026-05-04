import { CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Cellv = boolean | string;

const cols = ['runQ', 'Tally', 'Zoho Books', 'Vyapar'];

const rows: Array<[string, Cellv[]]> = [
  ['Pricing',                ['Free → ₹599/mo', '₹18,000/yr', '₹2,500/mo', '₹329/mo']],
  ['Native mobile apps',     [true, false, 'partial', true]],
  ['AI bill OCR',            [true, false, 'beta', false]],
  ['AI bank matching',       [true, false, false, false]],
  ['GSTR-2B reconciliation', [true, 'manual', true, false]],
  ['e-Invoice & e-Way bill', [true, true, true, 'limited']],
  ['CA read-only portal',    [true, false, false, false]],
  ['Tally-compatible export',[true, '—', false, false]],
  ['Setup time',             ['10 min', '~2 days', '~1 hr', '20 min']],
  ['Multi-device sync',      [true, false, true, 'partial']],
];

function Cell({ v, highlight }: { v: Cellv; highlight: boolean }) {
  const base = cn('px-3 py-3.5 text-sm tabular', highlight && 'bg-brand-50/60');
  if (v === true) {
    return (
      <td className={base}>
        <CheckCircle2 size={16} className={highlight ? 'text-brand-600' : 'text-emerald-500'} />
      </td>
    );
  }
  if (v === false) {
    return (
      <td className={base}>
        <X size={16} className="text-zinc-300" />
      </td>
    );
  }
  return (
    <td
      className={cn(
        base,
        'text-zinc-700',
        typeof v === 'string' && v.includes('partial') && 'text-amber-600',
      )}
    >
      {v}
    </td>
  );
}

export function Comparison() {
  return (
    <section id="compare" className="bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">vs the rest</div>
          <h2 className="mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
            We're <span className="font-display italic grad-text">honest</span> about the tradeoffs.
          </h2>
          <p className="mt-4 text-zinc-600">
            Tally has 30 years and an army of CAs. Zoho has reach. Vyapar is cheap. Here's where we win, lose, and tie.
          </p>
        </div>

        <div className="reveal mt-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="w-[28%] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500" />
                  {cols.map((c, i) => (
                    <th
                      key={c}
                      className={cn(
                        'px-3 py-4 text-left text-sm font-semibold',
                        i === 0 ? 'bg-brand-50/60 text-brand-700' : 'text-zinc-700',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {i === 0 ? (
                          <>
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-[11px] font-bold text-white">
                              Q
                            </span>
                            <span>runQ</span>
                          </>
                        ) : (
                          <span>{c}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, vals], rIdx) => (
                  <tr key={label} className={rIdx ? 'border-t border-zinc-100' : ''}>
                    <td className="px-4 py-3.5 text-sm font-medium text-zinc-800">{label}</td>
                    {vals.map((v, i) => (
                      <Cell key={i} v={v} highlight={i === 0} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="reveal mt-3 text-center text-[11px] text-zinc-400">
          Pricing as published by competitors at the time of writing. We'll keep this page honest as they ship.
        </p>
      </div>
    </section>
  );
}
