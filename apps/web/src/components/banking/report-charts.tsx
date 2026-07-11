import { lazy, Suspense, type ReactNode } from 'react';

// Shared category palette (hex, theme-neutral) — mirrors the analytics charts.
export const CATEGORY_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#9ca3af',
];

const ChartsModule = lazy(async () => {
  const recharts = await import('recharts');
  const {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
    PieChart, Pie, Cell,
  } = recharts;

  function fmtINRCompact(n: number): string {
    if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  }
  function fmtINRFull(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  }

  const AXIS_STROKE = 'rgba(127,127,127,0.25)';
  const GRID_STROKE = 'rgba(127,127,127,0.15)';
  const axisProps = { stroke: AXIS_STROKE } as const;

  function InVsOut({ data }: { data: Array<{ month: string; moneyIn: number; moneyOut: number }> }) {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 10 }} axisLine={axisProps} tickLine={axisProps} />
          <YAxis tickFormatter={fmtINRCompact} tick={{ fontSize: 10 }} width={64} axisLine={axisProps} tickLine={axisProps} />
          <Tooltip formatter={(v) => fmtINRFull(Number(v))} labelFormatter={(m) => m} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="moneyIn" fill="#10b981" name="In" radius={[2, 2, 0, 0]} />
          <Bar dataKey="moneyOut" fill="#f59e0b" name="Out" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function Donut({ data }: { data: Array<{ name: string; value: number }> }) {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => fmtINRFull(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  function Dispatcher(props:
    | { kind: 'inout'; data: Array<{ month: string; moneyIn: number; moneyOut: number }> }
    | { kind: 'donut'; data: Array<{ name: string; value: number }> }) {
    if (props.kind === 'inout') return <InVsOut data={props.data} />;
    return <Donut data={props.data} />;
  }
  return { default: Dispatcher };
});

function ChartShell({ height, children }: { height: number; children: ReactNode }) {
  return (
    <Suspense fallback={<div className="animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" style={{ height }} />}>
      {children}
    </Suspense>
  );
}

export function InVsOutChart(props: { data: Array<{ month: string; moneyIn: number; moneyOut: number }> }) {
  return <ChartShell height={220}><ChartsModule kind="inout" data={props.data} /></ChartShell>;
}

export function CategoryDonut(props: { data: Array<{ name: string; value: number }> }) {
  return <ChartShell height={240}><ChartsModule kind="donut" data={props.data} /></ChartShell>;
}
