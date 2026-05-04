import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Accent = 'brand' | 'emerald' | 'amber' | 'violet' | 'blue' | 'rose';

const accentMap: Record<Accent, string> = {
  brand: 'text-brand-600',
  emerald: 'text-emerald-700',
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  blue: 'text-blue-600',
  rose: 'text-rose-600',
};

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  titleItalic?: string;
  subtitle?: ReactNode;
  accent?: Accent;
}

export function PageHero({ eyebrow, title, titleItalic, subtitle, accent = 'brand' }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="aurora" />
      <div
        className="absolute inset-0 line-grid-light opacity-50"
        style={{
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pt-16 pb-10 lg:px-8 lg:pt-24 lg:pb-14">
        {eyebrow && (
          <div className={cn('reveal text-center text-xs font-semibold uppercase tracking-[0.18em]', accentMap[accent])}>
            {eyebrow}
          </div>
        )}
        <h1
          className="reveal mx-auto mt-3 max-w-4xl text-center leading-[1.05] tracking-tight text-zinc-900"
          style={{ fontSize: 'clamp(2rem, 5.4vw, 4.4rem)', textWrap: 'balance' }}
        >
          <span className="font-semibold">{title}</span>
          {titleItalic && (
            <>
              {' '}
              <span className="font-display italic grad-text">{titleItalic}</span>
            </>
          )}
        </h1>
        {subtitle && (
          <p
            className="reveal mx-auto mt-5 max-w-2xl text-center text-base text-zinc-600 lg:text-lg"
            style={{ textWrap: 'pretty' }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
