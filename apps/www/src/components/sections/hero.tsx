import { ArrowRight, Play, ShieldCheck, Smartphone, Sparkles, Users } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { MockDashboard } from '@/components/mockups/mock-dashboard';
import { WindowChrome } from '@/components/mockups/window-chrome';

export function Hero() {
  const { navigate } = useRouter();

  const trust: Array<[string, typeof ShieldCheck]> = [
    ['GST-ready', ShieldCheck],
    ['100% mobile', Smartphone],
    ['AI-first', Sparkles],
    ['CA-friendly', Users],
  ];

  return (
    <section className="relative overflow-hidden">
      <div className="aurora" />
      <div
        className="absolute inset-0 line-grid-light opacity-60"
        style={{
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-5 pb-10 pt-16 lg:px-8 lg:pb-16 lg:pt-24">
        <div className="reveal flex justify-center">
          <div className="inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs text-zinc-700 shadow-sm backdrop-blur">
            <span className="pulse-dot relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 text-emerald-500" />
            <span>Now in early access — free forever</span>
            <span className="hidden text-zinc-300 sm:inline">·</span>
            <span className="hidden text-zinc-500 sm:inline">No credit card</span>
          </div>
        </div>

        <h1
          className="reveal mx-auto mt-6 max-w-4xl text-center leading-[1] tracking-tight text-zinc-900"
          style={{ fontSize: 'clamp(2.4rem, 6.4vw, 5.2rem)', textWrap: 'balance' }}
        >
          <span className="font-semibold">Modern books for</span>
          <br />
          <span className="font-display italic grad-text">modern Indian businesses.</span>
        </h1>

        <p
          className="reveal mx-auto mt-6 max-w-2xl text-center text-base text-zinc-600 lg:text-lg"
          style={{ textWrap: 'pretty' }}
        >
          GST invoicing, bank reconciliation, AI bill capture — all in one mobile-first platform that owners actually open and CAs love at month-end.
        </p>

        <div className="reveal mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => navigate('/get-started')}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-zinc-900/20 transition-colors hover:bg-zinc-800"
          >
            Get started free <ArrowRight size={15} />
          </button>
          <a
            href="#showcase"
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white/80 px-5 py-3 text-sm font-medium text-zinc-800 backdrop-blur transition-colors hover:bg-white"
          >
            <Play size={11} /> See how it works
          </a>
        </div>

        <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          {trust.map(([label, Icon]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Icon size={13} className="text-brand-500" />
              {label}
            </span>
          ))}
        </div>

        {/* Dashboard mockup */}
        <div className="reveal relative mt-14">
          <div
            className="absolute inset-x-0 -top-12 -bottom-20 -z-10 mx-auto"
            style={{
              background: 'radial-gradient(60% 50% at 50% 50%, oklch(0.78 0.18 264 / .35), transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          <div className="mx-auto max-w-[1080px]">
            <div className="mockup-shadow rounded-2xl border border-zinc-200/80 bg-zinc-950 p-1.5 ring-1 ring-zinc-200/60">
              <div className="-mx-5 overflow-x-auto pb-2 md:mx-0 md:overflow-visible">
                <div className="min-w-[960px] md:min-w-0">
                  <WindowChrome url="app.runq.in/dashboard" height={600}>
                    <MockDashboard />
                  </WindowChrome>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logo strip */}
      <div className="relative border-y border-zinc-200/60 bg-white/40 py-6 backdrop-blur-sm">
        <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-y-3 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <span>Built for Indian SMEs from</span>
            {['Bengaluru', 'Mumbai', 'Delhi NCR', 'Chennai', 'Pune', 'Ahmedabad', 'Hyderabad'].map((c) => (
              <span key={c} className="font-mono text-zinc-500">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
