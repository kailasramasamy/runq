import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type Tone = 'pos' | 'neg' | 'warn' | 'neutral' | 'accent';

const TONE_BG: Record<Tone, string> = {
  pos: 'var(--pos-soft)',
  neg: 'var(--neg-soft)',
  warn: 'var(--warn-soft)',
  neutral: 'var(--surface-2)',
  accent: 'var(--accent-soft)',
};
const TONE_FG: Record<Tone, string> = {
  pos: 'var(--pos)',
  neg: 'var(--neg)',
  warn: 'var(--warn)',
  neutral: 'var(--text-2)',
  accent: 'var(--accent-text)',
};

export function Card2({
  children, className, padded = true, id,
}: { children: ReactNode; className?: string; padded?: boolean; id?: string }) {
  return (
    <div
      id={id}
      className={cn('rounded-lg border', padded && 'p-4', className)}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children, action, icon,
}: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
            style={{
              background: 'var(--surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {icon}
          </span>
        )}
        <h3 className="truncate text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
          {children}
        </h3>
      </div>
      {action}
    </div>
  );
}

export function Pill({
  tone = 'neutral', children, className,
}: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        className,
      )}
      style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 rounded-full', className)}
      style={{ background: TONE_FG[tone] }}
    />
  );
}

/**
 * Convert a Catmull-Rom polyline to a cubic-Bézier `path d` string. Gives
 * a smooth interpolation through every point without the sharp zigzag
 * that straight-segment paths produce on noisy data. Tension 0.5 (alpha)
 * gives a tame curve with minimal overshoot.
 */
function catmullRomToBezier(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const tension = 0.5;
  let d = `M${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Sparkline. By default a 56×28 stroke-only line — pass `fill` to render
 * an area-fill gradient under the line and `endDot` for a marker at the
 * last point. Pass `responsive` to make it expand to its container width.
 */
export function Sparkline({
  values, tone = 'neutral', width = 56, height = 28,
  fill = false, endDot = false, responsive = false,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  fill?: boolean;
  endDot?: boolean;
  responsive?: boolean;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = width;
  const h = height;
  // Reserve top + bottom padding so the line never sits on the edge —
  // important when values are constant (would otherwise render flat at
  // y=0 with no visible area-fill below).
  const padTop = 4;
  const padBottom = 4;
  const sideInset = 1;
  const usableH = h - padTop - padBottom;
  const stepX = (w - sideInset * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = sideInset + i * stepX;
    const y = padTop + usableH - ((v - min) / range) * usableH;
    return { x, y };
  });
  // Smooth via Catmull-Rom → cubic Bézier conversion. Tension 0.5 keeps
  // overshoot in check while removing the sharp zigzag look from raw
  // straight segments on noisy data.
  const linePath = catmullRomToBezier(points);
  const areaPath = `${linePath} L ${points[points.length - 1]!.x.toFixed(1)} ${h - padBottom} L ${points[0]!.x.toFixed(1)} ${h - padBottom} Z`;
  const last = points[points.length - 1]!;
  const fg = TONE_FG[tone];
  // Stable id so multiple gradients in the page don't collide.
  const gid = `spark-fill-${tone}-${Math.round(values[0] ?? 0)}-${values.length}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width={responsive ? '100%' : w}
      height={h}
      className="overflow-visible"
    >
      {fill && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fg} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fg} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={areaPath} fill={`url(#${gid})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={fg}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-draw"
      />
      {endDot && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={fg} />
      )}
    </svg>
  );
}

/** Progress ring (SVG). value 0–100. */
export function Ring({
  value, tone = 'pos', size = 88, label,
}: { value: number; tone?: Tone; size?: number; label?: string }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_FG[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease-out', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="num text-[20px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {Math.round(value)}
        </span>
        {label && (
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</span>
        )}
      </div>
    </div>
  );
}

/** Horizontal labelled bar — used in aging buckets. */
export function Bar({
  label, count, amount, pct, tone, formatAmount,
}: {
  label: string;
  count?: number;
  amount: number;
  pct: number;
  tone: Tone;
  formatAmount: (n: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span style={{ color: 'var(--text-2)' }}>
          {label}{count != null && <span className="ml-1.5 num text-[11px]" style={{ color: 'var(--text-3)' }}>{count}</span>}
        </span>
        <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatAmount(amount)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: TONE_FG[tone] }}
        />
      </div>
    </div>
  );
}
