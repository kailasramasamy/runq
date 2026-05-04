import { type ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Accent = 'brand' | 'emerald' | 'amber' | 'violet' | 'blue';

const accentText: Record<Accent, string> = {
  brand: 'text-brand-600',
  emerald: 'text-emerald-700',
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  blue: 'text-blue-600',
};

const accentBg: Record<Accent, string> = {
  brand: 'bg-brand-500/10 text-brand-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber: 'bg-amber-500/10 text-amber-700',
  violet: 'bg-violet-500/10 text-violet-600',
  blue: 'bg-blue-500/10 text-blue-600',
};

/* ───────── Section wrappers ───────── */

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24', className)}>
      {children}
    </section>
  );
}

export function GreySection({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('bg-zinc-50 py-16 lg:py-24', className)}>
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">{children}</div>
    </section>
  );
}

export function DarkSection({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('relative overflow-hidden bg-zinc-950 py-20 text-zinc-100', className)}>
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 lg:px-8">{children}</div>
    </section>
  );
}

/* ───────── Section heading ───────── */

interface SectionHeadProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: Accent;
  center?: boolean;
  /** Render with light text for use on dark backgrounds */
  dark?: boolean;
}

const accentTextDark: Record<Accent, string> = {
  brand: 'text-brand-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  violet: 'text-violet-300',
  blue: 'text-blue-300',
};

export function SectionHead({ eyebrow, title, subtitle, accent = 'brand', center, dark }: SectionHeadProps) {
  return (
    <div className={cn('reveal max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && (
        <div
          className={cn(
            'text-xs font-semibold uppercase tracking-[0.16em]',
            (dark ? accentTextDark : accentText)[accent],
          )}
        >
          {eyebrow}
        </div>
      )}
      <h2
        className={cn(
          'mt-2 text-3xl font-semibold tracking-tight lg:text-[40px] lg:leading-[1.1]',
          dark ? 'text-white' : 'text-zinc-900',
        )}
        style={{ textWrap: 'balance' }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={cn('mt-3', dark ? 'text-zinc-400' : 'text-zinc-600')} style={{ textWrap: 'pretty' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ───────── Icon grid ───────── */

export interface IconGridItem {
  Icon: LucideIcon;
  title: string;
  body: string;
}

export function IconGrid({ items, accent = 'brand', cols = 3 }: { items: IconGridItem[]; accent?: Accent; cols?: 2 | 3 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-5 md:grid-cols-2',
        cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
      )}
    >
      {items.map(({ Icon, title, body }) => (
        <div key={title} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-6">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', accentBg[accent])}>
            <Icon size={16} />
          </div>
          <div className="mt-4 text-base font-semibold text-zinc-900">{title}</div>
          <div className="mt-1.5 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>
            {body}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────── Feature row ───────── */

interface FeatureRowProps {
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  bullets?: string[];
  visual: ReactNode;
  flip?: boolean;
  accent?: Accent;
}

export function FeatureRow({ eyebrow, title, body, bullets, visual, flip, accent = 'brand' }: FeatureRowProps) {
  return (
    <div className={cn('grid grid-cols-12 items-center gap-8 lg:gap-14', flip && 'lg:[direction:rtl]')}>
      <div className="reveal col-span-12 lg:col-span-5 lg:[direction:ltr]">
        {eyebrow && (
          <div className={cn('text-xs font-semibold uppercase tracking-[0.16em]', accentText[accent])}>{eyebrow}</div>
        )}
        <h3
          className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 lg:text-3xl"
          style={{ textWrap: 'balance' }}
        >
          {title}
        </h3>
        {body && (
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-600" style={{ textWrap: 'pretty' }}>
            {body}
          </p>
        )}
        {bullets && (
          <ul className="mt-5 space-y-2.5 text-sm text-zinc-700">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                  <Check size={11} strokeWidth={3} />
                </span>
                <span style={{ textWrap: 'pretty' }}>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="reveal col-span-12 lg:col-span-7 lg:[direction:ltr]">{visual}</div>
    </div>
  );
}

/* ───────── Pill row ───────── */

export function PillRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span key={t} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700">
          {t}
        </span>
      ))}
    </div>
  );
}

/* ───────── Stats strip ───────── */

export interface Stat {
  k: string;
  v: string;
}

export function StatsStrip({ items }: { items: Stat[] }) {
  return (
    <div className="reveal grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.k} className="bg-white p-6">
          <div className="text-3xl font-semibold tracking-tight text-zinc-900 tabular">{s.v}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{s.k}</div>
        </div>
      ))}
    </div>
  );
}
