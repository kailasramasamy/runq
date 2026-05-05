import { Bell, Camera, Hash, RefreshCcw, type LucideIcon } from 'lucide-react';

interface Card {
  Icon: LucideIcon;
  title: string;
  sub: string;
}

const cards: Card[] = [
  { Icon: Camera,     title: 'OCR bill capture',     sub: 'Photograph any vendor invoice. We extract 24 fields with 99% accuracy and post the entry.' },
  { Icon: RefreshCcw, title: 'Auto bank matching',   sub: 'Live feeds from HDFC, ICICI, Axis, SBI. The AI matches narrations to invoices and bills.' },
  { Icon: Hash,       title: 'Smart categorization', sub: 'New vendors auto-mapped to ledgers. New expense types learn from your team in days.' },
  { Icon: Bell,       title: 'Payment reminders',    sub: 'Tone-tuned reminders by customer behaviour. Polite, firm, or warm — picks the right one.' },
];

export function AiBand() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-24 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="rupee-watermark pointer-events-none absolute -right-10 -top-20 hidden select-none text-[28rem] leading-none md:block">
        ₹
      </div>

      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-3xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">AI automation</div>
          <h2 className="mt-3 text-4xl tracking-tight lg:text-6xl">
            The accountant
            <br />
            <span className="font-display italic grad-text-light">that never sleeps.</span>
          </h2>
        </div>

        <div className="reveal mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div
              key={c.title}
              className="lift relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur"
            >
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-700/20 ring-1 ring-brand-400/20">
                <c.Icon size={18} className="text-brand-300" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.sub}</p>
              <div className="mt-5 font-mono text-[10px] text-zinc-600">0{i + 1} / 04</div>
            </div>
          ))}
        </div>

        {/* Big stat callout */}
        <div className="reveal mt-12">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-brand-950/40 via-zinc-900/40 to-zinc-950 p-6 sm:p-8 lg:p-12">
            <div className="absolute inset-0 dot-grid opacity-30" />
            <div className="relative flex flex-col items-center justify-between gap-6 lg:flex-row">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Average finance team</div>
                <div
                  className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-[1.05]"
                  style={{ fontSize: 'clamp(2rem, 8vw, 7rem)' }}
                >
                  <span className="font-display italic grad-text-light">saves</span>
                  <span className="font-bold text-white">6+</span>
                  <span className="font-display italic grad-text-light">hours/week</span>
                </div>
                <div className="mt-2 text-sm text-zinc-400">on bookkeeping, recon, and bill entry.</div>
              </div>
              <div className="flex flex-col gap-2 text-xs text-zinc-400">
                {(
                  [
                    ['90%+', 'auto-matched bank txns'],
                    ['2.4s', 'avg bill OCR extraction'],
                    ['22s', 'fastest invoice → IRN'],
                  ] as const
                ).map(([n, l]) => (
                  <div key={l} className="flex items-baseline gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2">
                    <span className="font-mono text-base font-semibold tabular text-brand-300">{n}</span>
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
