import { ArrowRight, Clock, Globe, Heart, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useRouter } from '@/lib/router';

const trust: Array<[string, LucideIcon]> = [
  ['Free forever plan', Heart],
  ['Setup in 10 minutes', Clock],
  ['Cancel anytime', ShieldCheck],
  ['India-based support', Globe],
];

export function CtaBanner() {
  const { navigate } = useRouter();
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-28 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="reveal mx-auto max-w-3xl text-center">
          <h2 className="text-4xl tracking-tight lg:text-7xl">
            <span className="font-semibold">Run your business,</span>
            <br />
            <span className="font-display italic grad-text-light">not your books.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-zinc-400" style={{ textWrap: 'pretty' }}>
            Free forever for solo founders. Pro plan starts at ₹599/mo when your team grows. No credit card to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-brand-500/20 hover:bg-zinc-100"
            >
              Get started free <ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
            >
              See pricing
            </button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            {trust.map(([l, Ic]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <Ic size={12} className="text-brand-400" />
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
