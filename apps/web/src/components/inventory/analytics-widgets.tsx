import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Presentational pieces for the inventory analytics page.
 *
 * Motion rules, applied throughout:
 *   • every animation checks `prefers-reduced-motion` and degrades to the
 *     final state instantly — never to a half-played one
 *   • reveals are on-mount and one-shot; nothing loops or pulses, because a
 *     page you read for decisions should stop moving once you're reading it
 */

/** True unless the OS asks for reduced motion. */
function useMotionOk(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setOk(!mq.matches);
    const on = () => setOk(!mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return ok;
}

/**
 * Counts from 0 to `value` once on mount, easing out so the last digits
 * settle rather than snapping. Returns `value` immediately when motion is
 * reduced or the number isn't finite.
 */
export function useCountUp(value: number, durationMs = 850): number {
  const motionOk = useMotionOk();
  const [shown, setShown] = useState(motionOk ? 0 : value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!motionOk || !Number.isFinite(value)) { setShown(value); return; }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [value, durationMs, motionOk]);

  return shown;
}

/** Fades + lifts its children in once, staggered by `index`. */
export function Reveal({ index = 0, children }: { index?: number; children: ReactNode }) {
  const motionOk = useMotionOk();
  const [shown, setShown] = useState(!motionOk);
  useEffect(() => {
    if (!motionOk) { setShown(true); return; }
    const t = setTimeout(() => setShown(true), 40 + index * 60);
    return () => clearTimeout(t);
  }, [index, motionOk]);
  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(8px)',
        transition: motionOk ? 'opacity 380ms ease-out, transform 380ms ease-out' : undefined,
      }}
    >
      {children}
    </div>
  );
}

export type StatTone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical';

/**
 * Status colours are fixed and never themed. They are only ever used
 * alongside a text label — as a categorical set they fail the CVD floor,
 * so hue must never be the only channel carrying the meaning.
 */
const TONE: Record<StatTone, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--text-2)', bg: 'var(--surface-2)' },
  good: { fg: '#0ca30c', bg: 'rgba(12,163,12,0.10)' },
  warning: { fg: '#fab219', bg: 'rgba(250,178,25,0.14)' },
  serious: { fg: '#ec835a', bg: 'rgba(236,131,90,0.14)' },
  critical: { fg: '#d03b3b', bg: 'rgba(208,59,59,0.12)' },
};

export function StatTile({
  icon: Icon, label, value, sub, tone = 'neutral', index = 0, loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  index?: number;
  loading?: boolean;
}) {
  const t = TONE[tone];
  return (
    <Reveal index={index}>
      <div
        className="flex h-full flex-col gap-2 rounded-xl border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: t.bg, color: t.fg }}
          >
            <Icon size={15} />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}>
            {label}
          </span>
        </div>
        {loading ? (
          <div className="h-6 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        ) : (
          <div className="text-[19px] font-semibold leading-none"
            style={{ color: tone === 'neutral' ? 'var(--text-1)' : t.fg }}>
            {value}
          </div>
        )}
        {sub && (
          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{sub}</div>
        )}
      </div>
    </Reveal>
  );
}

/** Status pill. Always renders its label — colour is reinforcement only. */
export function StatusBadge({ tone, label }: { tone: StatTone; label: string }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: t.bg, color: t.fg }}
    >
      {label}
    </span>
  );
}

/**
 * Thin proportion bar. `pct` is 0-100; the fill grows on mount so a row of
 * these reads as a small ranked chart rather than static furniture.
 */
export function MeterBar({ pct, tone = 'neutral' }: { pct: number; tone?: StatTone }) {
  const motionOk = useMotionOk();
  const [w, setW] = useState(motionOk ? 0 : pct);
  useEffect(() => {
    if (!motionOk) { setW(pct); return; }
    const t = setTimeout(() => setW(pct), 60);
    return () => clearTimeout(t);
  }, [pct, motionOk]);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--surface-2)' }}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, w))}%`,
          background: TONE[tone].fg,
          transition: motionOk ? 'width 620ms cubic-bezier(0.22,1,0.36,1)' : undefined,
        }}
      />
    </div>
  );
}

export function SectionCard({
  title, description, action, children, index = 0,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  index?: number;
}) {
  return (
    <Reveal index={index}>
      <div className="rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
            {description && (
              <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>{description}</p>
            )}
          </div>
          {action}
        </div>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </Reveal>
  );
}

/** Shown when a section genuinely has nothing to report — not an error. */
export function AllClear({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-4 text-[12px]"
      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
      {message}
    </div>
  );
}

export function formatInr(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
  if (a >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (a >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}

/** Trims trailing zeros so 5.000 reads as 5. */
export function formatQty(v: number): string {
  if (v === Math.trunc(v)) return String(v);
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
