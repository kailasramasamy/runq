import { CheckCircle2, ChevronRight, Clock, Plus, Sparkles } from 'lucide-react';
import { MockSidebar } from './mock-sidebar';

const lines: Array<[string, string, number, number, number, number]> = [
  ['HDPE Granules — Grade FG-2540', '39012000', 1500, 78.5, 18, 117750],
  ['LDPE Roll Stock 50µ', '39201019', 850, 122.0, 18, 103700],
  ['Master Batch Black MB-K9', '32041100', 120, 410.0, 18, 49200],
];

export function MockInvoice() {
  return (
    <div className="flex h-full min-w-[960px] bg-zinc-950 text-zinc-100">
      <MockSidebar active="Receivable" dense />
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-5 py-2.5">
          <ChevronRight size={12} className="rotate-180 text-zinc-500" />
          <span className="text-xs text-zinc-500">Receivable / Invoices /</span>
          <span className="text-xs font-medium text-zinc-200">New invoice</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300">
              Save draft
            </button>
            <button className="rounded-md bg-brand-500 px-2.5 py-1 text-[10px] font-medium text-white">
              Generate IRN & Send
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-4">
          {/* Left form */}
          <div className="col-span-7 flex flex-col gap-3">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                <span>Customer</span>
                <span className="text-brand-400">Tax Invoice · B2B</span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-[11px] font-semibold text-emerald-300">
                  BP
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">Bharat Polymers Pvt Ltd</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    GSTIN <span className="font-mono">29ABCDE1234F1Z5</span> · Bengaluru, Karnataka
                  </div>
                </div>
                <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                  VERIFIED
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/50">
              <div className="grid grid-cols-12 gap-2 border-b border-zinc-800/80 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
                <div className="col-span-5">Item / HSN</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-1 text-right">GST</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              {lines.map(([name, hsn, qty, rate, gst, amt]) => (
                <div
                  key={name}
                  className="grid grid-cols-12 items-center gap-2 border-b border-zinc-800/40 px-3 py-2 text-[11px] last:border-0"
                >
                  <div className="col-span-5">
                    <div className="text-zinc-100">{name}</div>
                    <div className="mt-0.5 font-mono text-[9px] text-zinc-500">HSN {hsn}</div>
                  </div>
                  <div className="col-span-2 text-right tabular text-zinc-300">{qty.toLocaleString('en-IN')}</div>
                  <div className="col-span-2 text-right tabular text-zinc-300">₹{rate.toFixed(2)}</div>
                  <div className="col-span-1 text-right tabular text-zinc-400">{gst}%</div>
                  <div className="col-span-2 text-right font-medium tabular">₹{amt.toLocaleString('en-IN')}</div>
                </div>
              ))}
              <button className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[10px] text-zinc-500 hover:text-brand-300">
                <Plus size={11} /> Add line
              </button>
            </div>
          </div>

          {/* Right summary */}
          <div className="col-span-5 flex flex-col gap-3">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span className="tabular">₹2,70,650.00</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">CGST 9%</span><span className="tabular">₹24,358.50</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">SGST 9%</span><span className="tabular">₹24,358.50</span></div>
                <div className="my-2 border-t border-zinc-800/80" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Total</span>
                  <span className="text-lg font-semibold tabular">₹3,19,367.00</span>
                </div>
                <div className="text-[9px] text-zinc-500">
                  Three Lakh Nineteen Thousand Three Hundred Sixty Seven Rupees Only
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">e-Invoice ready</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <div className="text-zinc-500">IRN</div>
                  <div className="font-mono text-emerald-200/90">a4c2…f9d1</div>
                </div>
                <div>
                  <div className="text-zinc-500">Ack No</div>
                  <div className="font-mono text-emerald-200/90">112526043118274</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-brand-300" />
                <span className="text-xs font-semibold text-brand-200">Auto-suggested</span>
              </div>
              <div className="mt-1.5 text-[10px] text-zinc-400">
                Based on last 12 invoices to this customer, payment usually clears in{' '}
                <span className="text-zinc-200">21 days</span>. Suggested terms:{' '}
                <span className="text-zinc-200">Net 30, 2/10 early-pay</span>.
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-[10px] text-zinc-500">
              <Clock size={11} />
              Drafted in <span className="mx-1 text-zinc-200">22 seconds</span>
              <span className="ml-auto rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-brand-300">⌘ ↵</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
