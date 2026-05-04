import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { PhoneFrame, MobileCashScreen } from '@/components/mockups/mock-phone';

export function ValueProps() {
  return (
    <section id="features" className="relative bg-white py-24">
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Why runQ</div>
          <h2 className="mt-3 text-4xl tracking-tight text-zinc-900 lg:text-5xl">
            Four things we got <span className="font-display italic grad-text">obsessively</span> right.
          </h2>
          <p className="mt-4 text-zinc-600">
            Not a list of every feature — the four bets that define why we exist.
          </p>
        </div>

        {/* Bento: 7-5 / 5-7 */}
        <div className="reveal mt-14 grid grid-cols-12 gap-4">
          {/* 1. Owner-friendly (7) */}
          <div className="lift col-span-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7 lg:col-span-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Owner-friendly
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              Your books in <span className="font-display italic">plain English</span>. Decisions in two taps.
            </h3>
            <p className="mt-2 max-w-md text-sm text-zinc-600">
              No double-entry jargon. No cryptic ledger codes. Just cash-in, cash-out, and what to do next.
            </p>

            {/* Mini cash card */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-zinc-500">Cash in hand · today</div>
                <div className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  +12.4%
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular text-zinc-900">₹84,62,418</span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="flex-1 rounded-md bg-emerald-50 px-2 py-1.5 text-center text-emerald-700">
                  <span className="block font-mono text-[10px] uppercase tracking-wider opacity-70">Coming in</span>
                  <span className="font-semibold tabular">₹2.34 Cr</span>
                </span>
                <span className="flex-1 rounded-md bg-rose-50 px-2 py-1.5 text-center text-rose-700">
                  <span className="block font-mono text-[10px] uppercase tracking-wider opacity-70">Going out</span>
                  <span className="font-semibold tabular">₹62.8 L</span>
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
                <Sparkles size={12} className="shrink-0 text-brand-600" />
                <span>
                  <span className="font-semibold">Healthy.</span> You can clear the ₹38L vendor run on Friday and still hold 6 weeks of runway.
                </span>
              </div>
            </div>
          </div>

          {/* 2. CA-friendly (5) */}
          <div className="lift col-span-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7 lg:col-span-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> CA-friendly
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              <span className="font-display italic">Loved</span> at month-end.
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Multi-client switcher, GSTR exports, audit trails, Tally handoff. The CA portal is read-only and built with practising CAs.
            </p>

            <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                    BP
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">Bharat Polymers Pvt Ltd</div>
                    <div className="text-[10px] text-zinc-500">FY 2026–27 · Client #4 of 27</div>
                  </div>
                  <ChevronDown size={14} className="text-zinc-400" />
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {(
                  [
                    ['SK', 'Sundar Steels & Alloys', 'GSTR-1 due in 3d', 'amber'],
                    ['KE', 'Kirti Enterprises', 'Books closed', 'zinc'],
                    ['RF', 'Reliance Foam Industries', '14 unmatched txns', 'rose'],
                  ] as const
                ).map(([ini, name, sub, color]) => (
                  <div key={name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white">
                    <div
                      className={
                        color === 'amber'
                          ? 'flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-[10px] font-semibold text-amber-700'
                          : color === 'rose'
                          ? 'flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-[10px] font-semibold text-rose-700'
                          : 'flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-600'
                      }
                    >
                      {ini}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{name}</div>
                    </div>
                    <span
                      className={
                        color === 'amber'
                          ? 'rounded text-[9px] font-medium text-amber-600'
                          : color === 'rose'
                          ? 'rounded text-[9px] font-medium text-rose-600'
                          : 'rounded text-[9px] font-medium text-zinc-500'
                      }
                    >
                      {sub}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. AI automation (5) */}
          <div className="lift col-span-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7 lg:col-span-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-violet-600">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> AI automation
            </div>
            <h3 className="mt-3 text-2xl tracking-tight text-zinc-900">
              Snap a bill. Get the <span className="font-display italic">extracted entry.</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              OCR + LLM extraction. Verifies GSTIN, matches HSN, picks the right ledger.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {/* Receipt photo */}
              <div className="aspect-[3/4] overflow-hidden rounded-lg border border-zinc-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
                <div className="space-y-1 font-mono text-[8px] leading-snug text-zinc-700">
                  <div className="text-center font-bold">RELIANCE FOAM</div>
                  <div className="text-center text-[7px]">Industries Pvt Ltd</div>
                  <div className="text-center text-[7px]">GSTIN: 27AABCR1234F1Z5</div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div className="flex justify-between"><span>Inv #</span><span>RF/26/4421</span></div>
                  <div className="flex justify-between"><span>Date</span><span>28-04-26</span></div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div>PU Foam 32d</div>
                  <div className="flex justify-between"><span>10 nos × 7245</span><span>72,450</span></div>
                  <div>Adhesive HF-2</div>
                  <div className="flex justify-between"><span>5 kg × 2594</span><span>12,970</span></div>
                  <div className="my-1 border-t border-dashed border-zinc-400" />
                  <div className="flex justify-between"><span>Subtotal</span><span>85,420</span></div>
                  <div className="flex justify-between"><span>IGST 18%</span><span>15,375.6</span></div>
                  <div className="flex justify-between font-bold"><span>TOTAL</span><span>1,00,795</span></div>
                </div>
              </div>
              {/* Extracted card */}
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700">
                  <Sparkles size={11} /> EXTRACTED
                </div>
                <div className="mt-2 space-y-1.5 text-[10px]">
                  {(
                    [
                      ['Vendor', 'Reliance Foam'],
                      ['GSTIN', '27AABCR1234…'],
                      ['Invoice', 'RF/26/4421'],
                      ['Date', '28 Apr 2026'],
                      ['Sub', '₹85,420.00'],
                      ['IGST', '₹15,375.60'],
                      ['HSN', '39074000'],
                      ['Ledger', 'Raw Materials'],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-zinc-500">{k}</span>
                      <span className="flex items-center gap-1 font-mono text-zinc-800">
                        <span className="max-w-[80px] truncate">{v}</span>
                        <Check size={9} className="shrink-0 text-emerald-500" />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded bg-violet-100 px-2 py-1 text-center text-[9px] font-semibold text-violet-700">
                  2.4s · 99.2% conf
                </div>
              </div>
            </div>
          </div>

          {/* 4. Mobile-first (7) */}
          <div className="lift relative col-span-12 overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-amber-50/50 via-white to-white p-7 lg:col-span-7">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Mobile-first
            </div>
            <h3 className="mt-3 max-w-md text-2xl tracking-tight text-zinc-900">
              Real native apps. <span className="font-display italic">Built for thumbs</span>, not laptops.
            </h3>
            <p className="mt-2 max-w-md text-sm text-zinc-600">
              iOS and Android apps that stand alone — offline drafts, biometric unlock, Hindi/Tamil/Kannada, the works.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              {['Offline drafts', 'Biometric unlock', 'Voice → invoice', 'Push approvals'].map((t) => (
                <div key={t} className="rounded-md border border-zinc-200 bg-white/80 px-2 py-1">{t}</div>
              ))}
            </div>

            {/* Tilted phone */}
            <div className="absolute -right-8 -bottom-12 hidden w-72 lg:block" style={{ transform: 'rotate(-6deg)' }}>
              <PhoneFrame screen={<MobileCashScreen />} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
