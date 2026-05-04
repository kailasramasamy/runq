import { Check } from 'lucide-react';
import { MockSidebar } from './mock-sidebar';
import { inr } from '@/lib/inr';

interface Row {
  gstin: string;
  name: string;
  invNo: string;
  date: string;
  taxable: number;
  igst: number | null;
  status: 'matched' | 'mismatch' | 'missing-2b' | 'missing-books';
  diff?: string;
}

const rows: Row[] = [
  { gstin: '27AABCR1234F1Z5', name: 'Reliance Foam Industries',  invNo: 'RF/24-25/4421', date: '28 Apr 2026', taxable: 85420,  igst: 15375.6, status: 'matched' },
  { gstin: '29AABCB5678G1Z2', name: 'Bharat Polymers (PO-8821)', invNo: 'BP/26-27/0184', date: '27 Apr 2026', taxable: 142000, igst: 25560,   status: 'matched' },
  { gstin: '24AABCK9012H1Z8', name: 'Kirti Enterprises',         invNo: 'KE/26/01124',   date: '26 Apr 2026', taxable: 38420,  igst: 6915.6,  status: 'mismatch', diff: '₹420 less in books' },
  { gstin: '06AABCS3456J1Z9', name: 'Sundar Steels & Alloys',    invNo: 'SS/26-27/0091', date: '24 Apr 2026', taxable: 216400, igst: 38952,   status: 'matched' },
  { gstin: '33AABCP7890K1Z3', name: 'Prime Textile (Coimbatore)', invNo: 'PT/26/2241',    date: '22 Apr 2026', taxable: 318900, igst: 57402,   status: 'missing-2b' },
  { gstin: '27AABCM2468L1Z6', name: 'Mahindra Logistics',        invNo: 'ML/26/9981',    date: '20 Apr 2026', taxable: 24500,  igst: 4410,    status: 'matched' },
  { gstin: '07AABCD1357M1Z4', name: 'Delhi Hardware Co',         invNo: 'DH/26/0445',    date: '18 Apr 2026', taxable: 18200,  igst: null,    status: 'missing-books', diff: 'Not in your books' },
];

const summary: Array<[string, string, string, '' | 'emerald' | 'amber' | 'rose']> = [
  ['Total invoices in 2B', '184', 'from 47 vendors', ''],
  ['Matched cleanly', '161', '87.5%', 'emerald'],
  ['Mismatches', '14', 'Avg ₹612 diff', 'amber'],
  ['Missing on either side', '9', '6 in 2B not in books', 'rose'],
];

export function MockGst() {
  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <MockSidebar active="GST" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-3">
          <div>
            <div className="text-xs text-zinc-500">GST Filing / GSTR-2B</div>
            <div className="text-sm font-semibold">April 2026 reconciliation</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300">
              Period: April 2026
            </div>
            <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300">
              Download CSV
            </button>
            <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">Mark resolved</button>
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
                    : color === 'amber'
                    ? 'mt-1 text-lg font-semibold tabular text-amber-300'
                    : color === 'rose'
                    ? 'mt-1 text-lg font-semibold tabular text-rose-300'
                    : 'mt-1 text-lg font-semibold tabular'
                }
              >
                {val}
              </div>
              <div className="text-[9px] text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-5 py-2 text-[9px] uppercase tracking-wider text-zinc-500">
            <div className="col-span-3">Vendor / GSTIN</div>
            <div className="col-span-2">Invoice no.</div>
            <div className="col-span-1">Date</div>
            <div className="col-span-2 text-right">Taxable</div>
            <div className="col-span-2 text-right">IGST</div>
            <div className="col-span-2">Status</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-5 py-2 text-[11px] last:border-0"
            >
              <div className="col-span-3 min-w-0">
                <div className="truncate text-zinc-100">{r.name}</div>
                <div className="font-mono text-[9px] text-zinc-500">{r.gstin}</div>
              </div>
              <div className="col-span-2 font-mono text-[10px] text-zinc-300">{r.invNo}</div>
              <div className="col-span-1 text-[10px] text-zinc-400">{r.date}</div>
              <div className="col-span-2 text-right tabular text-zinc-200">{inr(r.taxable, { decimals: 0 })}</div>
              <div className="col-span-2 text-right tabular text-zinc-300">
                {r.igst != null ? inr(r.igst, { decimals: 0 }) : '—'}
              </div>
              <div className="col-span-2">
                {r.status === 'matched' && (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                    <Check size={10} /> MATCHED
                  </span>
                )}
                {r.status === 'mismatch' && (
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                      MISMATCH
                    </span>
                    <span className="text-[9px] text-zinc-500">{r.diff}</span>
                  </div>
                )}
                {r.status === 'missing-books' && (
                  <span className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">
                    MISSING IN BOOKS
                  </span>
                )}
                {r.status === 'missing-2b' && (
                  <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">
                    PENDING IN 2B
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
