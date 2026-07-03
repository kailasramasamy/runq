import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, EmptyState, Input } from '@/components/ui';
import {
  useQualityTrend,
  milkTypeLabel,
  type MilkType,
  type MpQualityTrendRow,
} from '@/hooks/queries/use-milk-procurement';
import { Pills, shortDate, daysAgo, today } from './_node-dashboard-shared';
import { ChartTooltip } from './_daily-history';

type Preset = '7' | '14' | '30' | '90' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

// One stable colour per milk type (charts share these so a type reads the same
// across FAT / SNF / Water).
const MILK_COLOR: Record<MilkType, string> = {
  cow_a1: '#10b981',
  cow_a2: '#8b5cf6',
  buffalo: '#3b82f6',
  mixed: '#f59e0b',
  cow: '#71717a',
};
// `min` fixes the Y-axis floor so small variations read clearly (FAT sits ~3-4,
// SNF ~7-9); water starts at 0. Max stays auto.
const METRICS: { key: 'fat' | 'snf' | 'water'; label: string; min: number }[] = [
  { key: 'fat', label: 'FAT', min: 3 },
  { key: 'snf', label: 'SNF', min: 7 },
  { key: 'water', label: 'Water', min: 0 },
];

/** Pivot per-(date, milk type) rows into recharts rows keyed by date, one field
 * per milk type, plus the ordered list of milk types that carried this metric. */
function pivot(rows: MpQualityTrendRow[], metric: 'fat' | 'snf' | 'water') {
  const byDate = new Map<string, Record<string, number | string>>();
  const series: MilkType[] = [];
  for (const r of rows) {
    const v = r[metric];
    if (v == null) continue;
    if (!series.includes(r.milkType)) series.push(r.milkType);
    const row = byDate.get(r.date) ?? { date: shortDate(r.date) };
    row[r.milkType] = v;
    byDate.set(r.date, row);
  }
  return { data: [...byDate.values()], series };
}

function TrendChart({
  rows,
  metric,
  label,
  min,
}: {
  rows: MpQualityTrendRow[];
  metric: 'fat' | 'snf' | 'water';
  label: string;
  min: number;
}) {
  const { data, series } = pivot(rows, metric);
  return (
    <Card>
      <CardContent>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label} (%) · by milk type</p>
        {data.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-xs text-zinc-400">
            No readings in this window
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v) => v.toFixed(1)}
                domain={[min, 'auto']}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((mt) => (
                <Line
                  key={mt}
                  type="monotone"
                  dataKey={mt}
                  name={milkTypeLabel(mt)}
                  stroke={MILK_COLOR[mt]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function QualityTrendSection({ nodeId }: { nodeId?: string }) {
  const [preset, setPreset] = useState<Preset>('7');
  const [custom, setCustom] = useState({ from: daysAgo(6), to: today() });
  const range = preset === 'custom' ? custom : { from: daysAgo(Number(preset) - 1), to: today() };
  const { data } = useQualityTrend({ ...range, nodeId });
  const rows = data?.data ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-500">Quality trends</h2>
        <Pills value={preset} onChange={setPreset} options={PRESETS} />
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <Input
              label="From"
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              value={custom.to}
              max={today()}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No quality data in this window"
          description="Record collection to see per-milk-type quality trends."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {METRICS.map((m) => (
            <TrendChart key={m.key} rows={rows} metric={m.key} label={m.label} min={m.min} />
          ))}
        </div>
      )}
    </section>
  );
}
