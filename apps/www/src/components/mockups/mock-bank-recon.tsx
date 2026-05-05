import { Check, Sparkles } from 'lucide-react';
import { MockSidebar } from './mock-sidebar';
import { inr } from '@/lib/inr';

interface Txn {
  date: string;
  desc: string;
  amt: number;
  status: 'matched' | 'suggested' | 'unmatched';
  match: string | null;
  conf: number | null;
}

const txns: Txn[] = [
  { date: '02 May', desc: 'NEFT/SBIN0526782/BHARATPLM', amt: 472000, status: 'matched',  match: 'INV-2026/00428', conf: 99 },
  { date: '02 May', desc: 'IMPS/HDFC/AIRCONDITIONING', amt: -118500, status: 'matched',  match: 'BILL-AC-7821',   conf: 96 },
  { date: '02 May', desc: 'UPI/sundar@hdfc/ALLOYS',    amt: 216400,  status: 'suggested', match: 'INV-2026/00427', conf: 87 },
  { date: '01 May', desc: 'NEFT/AXIS/RELIANCEFOAM',    amt: -85420,  status: 'matched',  match: 'BILL-RF-2204',   conf: 100 },
  { date: '01 May', desc: 'BESCOM ELECTRICITY BILL',   amt: -38420,  status: 'matched',  match: 'BILL-EL-3309',   conf: 100 },
  { date: '01 May', desc: 'CHQ 042881 / KIRTI ENT',    amt: 145000,  status: 'unmatched', match: null,             conf: null },
  { date: '30 Apr', desc: 'NEFT/ICICI/PRIMETEX',       amt: 318900,  status: 'matched',  match: 'INV-2026/00425', conf: 94 },
  { date: '30 Apr', desc: 'GST CHALLAN 22042026',      amt: -142000, status: 'matched',  match: 'GST May·25',     conf: 100 },
];

const summary: Array<[string, string, string, 'emerald' | 'brand' | 'amber' | 'zinc']> = [
  ['Auto-matched', '142', 'of 156', 'emerald'],
  ['Suggested', '8', '92% avg conf', 'brand'],
  ['Needs review', '6', '~3 min', 'amber'],
  ['Closing balance', '₹84.6L', 'as of 14:32', 'zinc'],
];

export function MockBankRecon() {
  return (
    <div className="flex h-full min-w-[960px] bg-zinc-950 text-zinc-100">
      <MockSidebar active="Banking" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div>
            <div className="text-xs text-zinc-500">Bank Reconciliation</div>
            <div className="text-sm font-semibold">HDFC Current ····4521</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live feed
            </div>
            <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300">Filter</button>
            <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">Approve all matches</button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-zinc-800/80 px-5 py-3">
          {summary.map(([label, val, sub, color]) => (
            <div key={label} className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
              <div
                className={
                  color === 'emerald'
                    ? 'mt-1 text-lg font-semibold tabular text-emerald-300'
                    : color === 'brand'
                    ? 'mt-1 text-lg font-semibold tabular text-brand-300'
                    : color === 'amber'
                    ? 'mt-1 text-lg font-semibold tabular text-amber-300'
                    : 'mt-1 text-lg font-semibold tabular'
                }
              >
                {val}
              </div>
              <div className="text-[9px] text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-b border-zinc-800/80 px-5 py-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Match progress · this statement</span>
            <span className="tabular text-zinc-200">142 / 156 (91%)</span>
          </div>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bar-rise"
              style={{
                width: '91%',
                background: 'linear-gradient(to right, oklch(0.72 0.16 162), oklch(0.59 0.20 264))',
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-5 py-2 text-[9px] uppercase tracking-wider text-zinc-500">
            <div className="col-span-1">Date</div>
            <div className="col-span-4">Bank narration</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1 text-center">→</div>
            <div className="col-span-3">runQ match</div>
            <div className="col-span-1 text-right">Status</div>
          </div>
          {txns.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-5 py-2 text-[11px] last:border-0"
            >
              <div className="col-span-1 text-zinc-400">{t.date}</div>
              <div className="col-span-4 truncate font-mono text-zinc-300">{t.desc}</div>
              <div className={`col-span-2 text-right font-medium tabular ${t.amt > 0 ? 'text-emerald-300' : 'text-zinc-200'}`}>
                {t.amt > 0 ? '+' : ''}
                {inr(Math.abs(t.amt), { decimals: 0 })}
              </div>
              <div className="col-span-1 text-center text-zinc-600">{t.status === 'unmatched' ? '?' : '↔'}</div>
              <div className="col-span-3">
                {t.match ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-200">{t.match}</span>
                    {t.conf && (
                      <span
                        className={
                          t.conf >= 95
                            ? 'rounded border border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] font-semibold text-emerald-300'
                            : t.conf >= 85
                            ? 'rounded border border-brand-500/30 bg-brand-500/10 px-1 text-[9px] font-semibold text-brand-300'
                            : 'rounded border border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-semibold text-amber-300'
                        }
                      >
                        {t.conf}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="italic text-zinc-500">no match found</span>
                )}
              </div>
              <div className="col-span-1 text-right">
                {t.status === 'matched' && <Check size={13} className="ml-auto text-emerald-400" />}
                {t.status === 'suggested' && <Sparkles size={13} className="ml-auto text-brand-400" />}
                {t.status === 'unmatched' && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">REVIEW</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
