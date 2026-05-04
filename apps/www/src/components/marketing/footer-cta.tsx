import { ArrowRight } from 'lucide-react';
import { useRouter } from '@/lib/router';

export function FooterCTA() {
  const { navigate } = useRouter();
  return (
    <section className="relative overflow-hidden bg-zinc-950 py-20 text-zinc-100">
      <div className="aurora aurora-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 text-center lg:px-8">
        <h2 className="reveal text-3xl tracking-tight lg:text-5xl">
          <span className="font-semibold">Run your business,</span>{' '}
          <span className="font-display italic grad-text-light">not your books.</span>
        </h2>
        <div className="reveal mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
      </div>
    </section>
  );
}
