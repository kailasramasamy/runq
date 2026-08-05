import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

/**
 * Inventory analytics charts.
 *
 * Recharts is lazy-loaded exactly as `components/analytics/charts.tsx` does
 * it — the library is heavy and the analytics page is not the landing route.
 *
 * ── Palette ──────────────────────────────────────────────────────────────
 * Every colour below was run through the dataviz validator against THIS
 * app's real surfaces (light #ffffff, dark #13151a), not the defaults:
 *
 *   categorical 2-series  light #2a78d6/#eb6834 · dark #3987e5/#d95926
 *     → all checks pass; worst adjacent CVD ΔE 24.7 light / 26.8 dark
 *   velocity ordinal ramp  one hue, monotone lightness, validated --ordinal
 *     → oriented per mode so "fast" is the most prominent step against
 *       whichever surface it lands on
 *
 * Status colours (good/warning/serious/critical) are deliberately NOT used
 * as chart series: as a categorical set they fail the normal-vision floor
 * (warning↔serious ΔE 13.6). They appear only on badges that carry a text
 * label, which is the documented mitigation — colour never carries meaning
 * alone. The alarm about dead stock lives in a labelled stat tile, not in a
 * slice colour.
 *
 * No chart here uses two y-axes. Where two measures of different scale
 * needed showing (stock level vs flow through the period), they are two
 * separate charts.
 */

const PALETTE = {
  light: {
    series: ['#2a78d6', '#eb6834'],
    // [dead, slow, medium, fast] — fast is the darkest step on white.
    velocity: ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'],
    grid: '#e1e0d9',
    axis: '#898781',
    surface: '#ffffff',
  },
  dark: {
    series: ['#3987e5', '#d95926'],
    // Same ramp, flipped: fast is the lightest step on the dark surface.
    velocity: ['#1c5cab', '#3987e5', '#6da7ec', '#9ec5f4'],
    grid: '#2c2c2a',
    axis: '#898781',
    surface: '#13151a',
  },
} as const;

export const VELOCITY_ORDER = ['dead', 'slow', 'medium', 'fast'] as const;

/** Reads the theme the same way the rest of the app does. */
function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Subscribes to the theme instead of sampling it once.
 *
 * The rest of the app themes through CSS custom properties, which repaint
 * on their own when the `dark` class flips. Chart marks don't — their
 * colours are SVG attributes chosen in JS, so without this the charts kept
 * their light-mode hues on the dark surface after a toggle (caught in a
 * dark-mode screenshot). Those hues were never validated against the dark
 * surface, so this is a legibility bug, not just a cosmetic one.
 */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Honour the OS reduced-motion setting for every animated chart. */
function motionOk(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const ChartsModule = lazy(async () => {
  const {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell,
  } = await import('recharts');

  function inrCompact(n: number): string {
    const a = Math.abs(n);
    if (a >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (a >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (a >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  }
  function inrFull(n: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(n);
  }
  /** "2026-08-03" → "3 Aug"; "2026-08" → "Aug 26". */
  function shortDate(raw: unknown): string {
    const s = String(raw ?? '');
    if (/^\d{4}-\d{2}$/.test(s)) {
      const d = new Date(`${s}-01T00:00:00`);
      return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    }
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function useTheme() {
    return useDarkMode() ? PALETTE.dark : PALETTE.light;
  }

  const anim = motionOk();
  const ANIM_MS = 700;

  const axis = (c: string) => ({ stroke: c });
  const tick = { fontSize: 10 } as const;

  // ── Stock value over time ───────────────────────────────────────────
  // One series, so no legend — the card title names it.
  function ValueTrend({ data }: { data: Array<{ bucket: string; closingValue: number }> }) {
    const p = useTheme();
    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="invValueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.series[0]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={p.series[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={p.grid} vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={shortDate} tick={tick} minTickGap={26}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <YAxis tickFormatter={inrCompact} tick={tick} width={62}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <Tooltip
            formatter={(v) => [inrFull(Number(v)), 'Closing value']}
            labelFormatter={shortDate}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Area
            type="monotone" dataKey="closingValue" stroke={p.series[0]} strokeWidth={2}
            fill="url(#invValueFill)" dot={false} activeDot={{ r: 4 }}
            isAnimationActive={anim} animationDuration={ANIM_MS}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ── Stock in vs out ─────────────────────────────────────────────────
  function FlowChart({ data }: { data: Array<{ bucket: string; inValue: number; outValue: number }> }) {
    const p = useTheme();
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={p.grid} vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={shortDate} tick={tick} minTickGap={26}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <YAxis tickFormatter={inrCompact} tick={tick} width={62}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <Tooltip
            formatter={(v, n) => [inrFull(Number(v)), n === 'inValue' ? 'Received' : 'Issued']}
            labelFormatter={shortDate}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => (v === 'inValue' ? 'Received' : 'Issued')} />
          <Bar dataKey="inValue" fill={p.series[0]} radius={[4, 4, 0, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS} />
          <Bar dataKey="outValue" fill={p.series[1]} radius={[4, 4, 0, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS} animationBegin={120} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── ABC concentration ───────────────────────────────────────────────
  // Both series are percentages, so one axis carries them honestly. This is
  // the Pareto insight without the dual-axis cumulative line: "A is 12% of
  // your SKUs and 80% of your consumption value".
  function AbcChart({ data }: {
    data: Array<{ abcClass: string; skuPct: number; valuePct: number }>;
  }) {
    const p = useTheme();
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={p.grid} vertical={false} />
          <XAxis dataKey="abcClass" tick={tick} axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <YAxis tickFormatter={(v: number) => `${v}%`} tick={tick} width={40}
            domain={[0, 100]} axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <Tooltip
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === 'skuPct' ? 'Share of SKUs' : 'Share of value']}
            labelFormatter={(c) => `Class ${c}`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => (v === 'skuPct' ? 'Share of SKUs' : 'Share of value')} />
          <Bar dataKey="skuPct" fill={p.series[0]} radius={[4, 4, 0, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS} />
          <Bar dataKey="valuePct" fill={p.series[1]} radius={[4, 4, 0, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS} animationBegin={120} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Velocity mix ────────────────────────────────────────────────────
  // Stock value by how fast it turns. Ordinal ramp, one hue: this is a
  // ranked scale, not four independent identities.
  function VelocityChart({ data }: {
    data: Array<{ band: string; value: number }>;
  }) {
    const p = useTheme();
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={p.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={inrCompact} tick={tick}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <YAxis type="category" dataKey="band" tick={tick} width={72}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <Tooltip
            formatter={(v) => [inrFull(Number(v)), 'Stock value']}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS}>
            {data.map((d) => (
              <Cell
                key={d.band}
                fill={p.velocity[Math.max(0, VELOCITY_ORDER.indexOf(
                  d.band.toLowerCase() as typeof VELOCITY_ORDER[number],
                ))]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Expiry write-off forecast ───────────────────────────────────────
  function ExpiryChart({ data }: {
    data: Array<{ month: string; value: number; alreadyExpired: boolean }>;
  }) {
    const p = useTheme();
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={p.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={shortDate} tick={tick}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <YAxis tickFormatter={inrCompact} tick={tick} width={62}
            axisLine={axis(p.grid)} tickLine={axis(p.grid)} />
          <Tooltip
            formatter={(v) => [inrFull(Number(v)), 'Value at risk']}
            labelFormatter={shortDate}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}
            isAnimationActive={anim} animationDuration={ANIM_MS}>
            {data.map((d) => (
              // Past-dated buckets are already a loss, not a forecast. The
              // row is labelled "expired" in the table beneath — the darker
              // step is reinforcement, not the only signal.
              <Cell key={d.month} fill={d.alreadyExpired ? p.velocity[3] : p.series[1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  type Props =
    | { kind: 'value-trend'; data: Array<{ bucket: string; closingValue: number }> }
    | { kind: 'flow'; data: Array<{ bucket: string; inValue: number; outValue: number }> }
    | { kind: 'abc'; data: Array<{ abcClass: string; skuPct: number; valuePct: number }> }
    | { kind: 'velocity'; data: Array<{ band: string; value: number }> }
    | { kind: 'expiry'; data: Array<{ month: string; value: number; alreadyExpired: boolean }> };

  function Dispatcher(props: Props) {
    if (props.kind === 'value-trend') return <ValueTrend data={props.data} />;
    if (props.kind === 'flow') return <FlowChart data={props.data} />;
    if (props.kind === 'abc') return <AbcChart data={props.data} />;
    if (props.kind === 'velocity') return <VelocityChart data={props.data} />;
    return <ExpiryChart data={props.data} />;
  }
  return { default: Dispatcher };
});

function ChartShell({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="h-[220px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      }
    >
      {children}
    </Suspense>
  );
}

export function StockValueTrendChart(props: {
  data: Array<{ bucket: string; closingValue: number }>;
}) {
  return <ChartShell><ChartsModule kind="value-trend" data={props.data} /></ChartShell>;
}

export function StockFlowChart(props: {
  data: Array<{ bucket: string; inValue: number; outValue: number }>;
}) {
  return <ChartShell><ChartsModule kind="flow" data={props.data} /></ChartShell>;
}

export function AbcConcentrationChart(props: {
  data: Array<{ abcClass: string; skuPct: number; valuePct: number }>;
}) {
  return <ChartShell><ChartsModule kind="abc" data={props.data} /></ChartShell>;
}

export function VelocityMixChart(props: { data: Array<{ band: string; value: number }> }) {
  return <ChartShell><ChartsModule kind="velocity" data={props.data} /></ChartShell>;
}

export function ExpiryForecastChart(props: {
  data: Array<{ month: string; value: number; alreadyExpired: boolean }>;
}) {
  return <ChartShell><ChartsModule kind="expiry" data={props.data} /></ChartShell>;
}
