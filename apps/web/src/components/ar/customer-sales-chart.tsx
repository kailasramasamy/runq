import { lazy, Suspense } from 'react';

/**
 * Revenue-over-time bars for one customer. Recharts is loaded lazily and
 * strokes are theme-neutral, mirroring `components/analytics/charts.tsx`
 * so this renders correctly in light and dark mode without a theme hook.
 */
const ChartModule = lazy(async () => {
  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } = await import('recharts');

  const AXIS_STROKE = 'rgba(127,127,127,0.25)';
  const GRID_STROKE = 'rgba(127,127,127,0.15)';

  // Recharts' default tooltip hardcodes a white panel with a light-grey
  // label, which is unreadable on a dark background. Drive it off the same
  // surface/text tokens the rest of the page uses so it follows the theme.
  const TOOLTIP_CONTENT_STYLE = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    fontSize: 12,
    padding: '6px 10px',
  } as const;
  const TOOLTIP_LABEL_STYLE = { color: 'var(--text-3)', fontSize: 11, marginBottom: 2 } as const;
  const TOOLTIP_ITEM_STYLE = { color: 'var(--text-1)' } as const;
  // The hover band behind the bar defaults to opaque light grey.
  const TOOLTIP_CURSOR = { fill: 'rgba(127,127,127,0.15)' } as const;
  // Axis labels default to a hardcoded #666, which is dim on dark.
  const TICK_STYLE = { fontSize: 10, fill: 'var(--text-3)' } as const;

  function fmtCompact(n: number): string {
    if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  }

  function fmtFull(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  }

  /** Month-day for daily/weekly buckets, `Mon YY` for monthly. */
  function tickLabel(period: string, groupBy: string): string {
    if (groupBy === 'month') {
      const d = new Date(`${period}T00:00:00`);
      return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    }
    return period.slice(5);
  }

  function TrendChart({
    data, groupBy,
  }: { data: Array<{ period: string; revenue: number }>; groupBy: string }) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="period"
            tickFormatter={(p: string) => tickLabel(p, groupBy)}
            tick={TICK_STYLE}
            minTickGap={16}
            axisLine={{ stroke: AXIS_STROKE }}
            tickLine={{ stroke: AXIS_STROKE }}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={TICK_STYLE}
            width={64}
            axisLine={{ stroke: AXIS_STROKE }}
            tickLine={{ stroke: AXIS_STROKE }}
          />
          <Tooltip
            formatter={(v) => [fmtFull(Number(v)), 'Sales']}
            labelFormatter={(p) => tickLabel(String(p ?? ''), groupBy)}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={TOOLTIP_CURSOR}
          />
          <Bar dataKey="revenue" fill="#6366f1" name="Sales" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return { default: TrendChart };
});

export function CustomerSalesTrendChart(props: {
  data: Array<{ period: string; revenue: number }>;
  groupBy: string;
}) {
  return (
    <Suspense fallback={<div className="h-[200px] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />}>
      <ChartModule {...props} />
    </Suspense>
  );
}
