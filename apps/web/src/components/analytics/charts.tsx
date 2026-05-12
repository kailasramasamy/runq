import { lazy, Suspense, type ReactNode } from 'react';

const ChartsModule = lazy(async () => {
  const recharts = await import('recharts');
  const { ResponsiveContainer, LineChart, BarChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } = recharts;

  function fmtINRCompact(n: number): string {
    if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (Math.abs(n) >= 1_000)       return `₹${(n / 1_000).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  }

  function fmtINRFull(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  }

  // Theme-neutral soft stroke that works in both light and dark mode
  // without overpowering chart content.
  const AXIS_STROKE = 'rgba(127,127,127,0.25)';
  const GRID_STROKE = 'rgba(127,127,127,0.15)';
  const axisProps = { stroke: AXIS_STROKE } as const;
  const tickLineProps = { stroke: AXIS_STROKE } as const;

  function RevExpChart({ data }: { data: Array<{ month: string; revenue: number; expense: number }> }) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 10 }} axisLine={axisProps} tickLine={tickLineProps} />
          <YAxis tickFormatter={fmtINRCompact} tick={{ fontSize: 10 }} width={64} axisLine={axisProps} tickLine={tickLineProps} />
          <Tooltip formatter={(v) => fmtINRFull(Number(v))} labelFormatter={(m) => m} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[2, 2, 0, 0]} />
          <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function BankTrendChart({ data }: { data: Array<{ date: string; balance: number }> }) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10 }} minTickGap={30} axisLine={axisProps} tickLine={tickLineProps} />
          <YAxis tickFormatter={fmtINRCompact} tick={{ fontSize: 10 }} width={64} axisLine={axisProps} tickLine={tickLineProps} />
          <Tooltip formatter={(v) => fmtINRFull(Number(v))} />
          <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function DsoChart({ data }: { data: Array<{ month: string; dso: number | null }> }) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 10 }} axisLine={axisProps} tickLine={tickLineProps} />
          <YAxis tick={{ fontSize: 10 }} width={40} axisLine={axisProps} tickLine={tickLineProps} />
          <Tooltip formatter={(v) => `${v} days`} />
          <Line type="monotone" dataKey="dso" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function Dispatcher(props: { kind: 'revexp'; data: Array<{ month: string; revenue: number; expense: number }> }
    | { kind: 'bank'; data: Array<{ date: string; balance: number }> }
    | { kind: 'dso'; data: Array<{ month: string; dso: number | null }> }) {
    if (props.kind === 'revexp') return <RevExpChart data={props.data} />;
    if (props.kind === 'bank') return <BankTrendChart data={props.data} />;
    return <DsoChart data={props.data} />;
  }
  return { default: Dispatcher };
});

function ChartShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="h-[200px] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />}>
      {children}
    </Suspense>
  );
}

export function RevenueVsExpenseChart(props: { data: Array<{ month: string; revenue: number; expense: number }> }) {
  return <ChartShell><ChartsModule kind="revexp" data={props.data} /></ChartShell>;
}

export function BankBalanceChart(props: { data: Array<{ date: string; balance: number }> }) {
  return <ChartShell><ChartsModule kind="bank" data={props.data} /></ChartShell>;
}

export function DsoChart(props: { data: Array<{ month: string; dso: number | null }> }) {
  return <ChartShell><ChartsModule kind="dso" data={props.data} /></ChartShell>;
}
