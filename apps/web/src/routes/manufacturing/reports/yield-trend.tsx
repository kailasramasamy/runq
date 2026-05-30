import { lazy, Suspense } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { TrendingUp } from 'lucide-react';
import {
  PageHeader, Combobox, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Skeleton,
} from '@/components/ui';
import { useYieldTrend } from '@/hooks/queries/use-mfg-reports';
import { useBoms } from '@/hooks/queries/use-boms';
import type { YieldTrendPoint } from '@runq/types';

const ACCENT = '#E11D48';

// ─── Lazy recharts chart (same pattern as charts.tsx) ────────────────────────

const YieldChartModule = lazy(async () => {
  const recharts = await import('recharts');
  const {
    ResponsiveContainer, LineChart, Line,
    XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  } = recharts;

  const AXIS_STROKE = 'rgba(127,127,127,0.25)';
  const GRID_STROKE = 'rgba(127,127,127,0.15)';
  const axisProps = { stroke: AXIS_STROKE } as const;
  const tickLineProps = { stroke: AXIS_STROKE } as const;

  // Rotating palette for multiple BOM lines
  const BOM_COLORS = ['#E11D48', '#2563eb', '#d97706', '#7c3aed', '#059669', '#0891b2'];

  function YieldLineChart({ series, bomLabels }: {
    series: Record<string, { bucketDate: string; yieldPct: number | null }[]>;
    bomLabels: Record<string, string>;
  }) {
    const bomIds = Object.keys(series);
    const allDates = [...new Set(bomIds.flatMap((b) => series[b].map((p) => p.bucketDate)))].sort();

    const chartData = allDates.map((d) => {
      const row: Record<string, string | number | null> = { date: d };
      for (const bomId of bomIds) {
        const point = series[bomId].find((p) => p.bucketDate === d);
        row[bomId] = point?.yieldPct ?? null;
      }
      return row;
    });

    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 10 }}
            axisLine={axisProps}
            tickLine={tickLineProps}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10 }}
            width={48}
            axisLine={axisProps}
            tickLine={tickLineProps}
          />
          <Tooltip formatter={(v) => (v === null ? '—' : `${Number(v).toFixed(1)}%`)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {bomIds.map((bomId, idx) => (
            <Line
              key={bomId}
              type="monotone"
              dataKey={bomId}
              name={bomLabels[bomId] ?? bomId.slice(0, 8)}
              stroke={BOM_COLORS[idx % BOM_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return { default: YieldLineChart };
});

interface YieldChartProps {
  series: Record<string, { bucketDate: string; yieldPct: number | null }[]>;
  bomLabels: Record<string, string>;
}

function YieldChart(props: YieldChartProps) {
  return (
    <Suspense fallback={<div className="h-[240px] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />}>
      <YieldChartModule {...props} />
    </Suspense>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BUCKET_OPTIONS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

type Params = { bomId?: string; bucket?: 'day' | 'week' | 'month'; from?: string; to?: string };

export function YieldTrendReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;

  function update(patch: Partial<Params>) {
    navigate({
      to: '/manufacturing/reports/yield-trend',
      search: (prev) => {
        const next = { ...(prev as Params), ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (!next[k]) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }

  const { data: bomsData } = useBoms({ limit: 200 });
  const filter = {
    bomId: params.bomId,
    bucket: params.bucket,
    from: params.from,
    to: params.to,
  };
  const { data, isLoading } = useYieldTrend(filter);
  const points: YieldTrendPoint[] = data?.data ?? [];

  const bomOptions = [
    { value: '', label: 'All BOMs' },
    ...(bomsData?.data ?? []).map((b) => ({ value: b.id, label: `${b.bomCode} — ${b.name}` })),
  ];

  // Group by bomId for chart
  const series: Record<string, { bucketDate: string; yieldPct: number | null }[]> = {};
  const bomLabels: Record<string, string> = {};
  for (const p of points) {
    if (!series[p.bomId]) series[p.bomId] = [];
    series[p.bomId].push({ bucketDate: p.bucketDate, yieldPct: p.yieldPct });
    bomLabels[p.bomId] = p.bomCode;
  }

  return (
    <div>
      <PageHeader
        title="Yield trend"
        description="Actual output vs planned output over time, bucketed by day / week / month."
        fullWidth
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={params.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={params.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">BOM</label>
          <Combobox value={params.bomId ?? ''} onChange={(v) => update({ bomId: v || undefined })} options={bomOptions} />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Bucket</label>
          <Combobox
            value={params.bucket ?? 'day'}
            onChange={(v) => update({ bucket: (v as 'day' | 'week' | 'month') || undefined })}
            options={BUCKET_OPTIONS}
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mb-6 h-[240px] w-full" />
      ) : points.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No yield data yet"
          description="Close work orders to generate yield trend data."
        />
      ) : (
        <>
          {/* Chart */}
          <div
            className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            style={{ borderTopColor: ACCENT, borderTopWidth: 2 }}
          >
            <YieldChart series={series} bomLabels={bomLabels} />
          </div>

          {/* Summary table */}
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Detail
          </h2>
          {isLoading ? (
            <TableSkeleton rows={3} cols={6} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Bucket</Th>
                  <Th>BOM</Th>
                  <Th className="text-right">Runs</Th>
                  <Th className="text-right">Planned qty</Th>
                  <Th className="text-right">Actual qty</Th>
                  <Th className="text-right">Yield %</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{p.bucketDate}</TableCell>
                    <TableCell className="font-mono text-sm" style={{ color: ACCENT }}>{p.bomCode}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{p.runs}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{p.plannedQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{p.actualOutputQty.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      <YieldPctCell pct={p.yieldPct} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

function YieldPctCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-400">—</span>;
  const color = pct >= 95 ? '#16a34a' : pct >= 80 ? '#d97706' : '#dc2626';
  return (
    <span className="font-mono tabular-nums" style={{ color }}>
      {pct.toFixed(1)}%
    </span>
  );
}
