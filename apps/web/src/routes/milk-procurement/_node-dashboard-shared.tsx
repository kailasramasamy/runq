import { useState, type ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChevronDown, ChevronRight, Droplets, Users, Coins, FlaskConical, TrendingUp, BarChart3, Inbox } from 'lucide-react';
import {
  Card, CardContent, StatsCard, EmptyState,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import type { MpCollectionSummary } from '@/hooks/queries/use-milk-procurement';

// ── date helpers ──────────────────────────────────────────────────────────────
export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
export const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
const dayNum = (iso: string) => iso.slice(8, 10);

// ── qty-weighted QC aggregation (shared by VMCC pours + CC consignments) ───────
export interface QcDay { date: string; totalQty: number; fat: number | null; snf: number | null; water: number | null }
export interface QcSample { date: string; qty: number; fat: number | null; snf: number | null; water: number | null }

/** Qty-weighted FAT/SNF/Water over a sample set (null when no sample carried it). */
export function weighted(samples: QcSample[]): { qty: number; fat: number | null; snf: number | null; water: number | null } {
  let qty = 0, fW = 0, fQ = 0, sW = 0, sQ = 0, wW = 0, wQ = 0;
  for (const s of samples) {
    qty += s.qty;
    if (s.fat != null) { fW += s.qty * s.fat; fQ += s.qty; }
    if (s.snf != null) { sW += s.qty * s.snf; sQ += s.qty; }
    if (s.water != null) { wW += s.qty * s.water; wQ += s.qty; }
  }
  return { qty, fat: fQ > 0 ? fW / fQ : null, snf: sQ > 0 ? sW / sQ : null, water: wQ > 0 ? wW / wQ : null };
}

/** Collapse samples into one qty-weighted QcDay per date, newest day first. */
export function aggregateByDate(samples: QcSample[]): QcDay[] {
  const byDate = new Map<string, QcSample[]>();
  for (const s of samples) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push(s);
  return [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1)).map((date) => {
    const w = weighted(byDate.get(date)!);
    return { date, totalQty: w.qty, fat: w.fat, snf: w.snf, water: w.water };
  });
}

// ── period summary stat grid (reused on every Overview tab) ────────────────────
export function SummaryStats({ summary }: { summary?: MpCollectionSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatsCard title="Total milk (L)" value={summary?.totalQty ?? 0} icon={Droplets} formatValue={(v) => `${v.toLocaleString()} L`} />
      <StatsCard title="AM / PM (L)" value={summary?.amQty ?? 0} icon={TrendingUp} formatValue={() => `${summary?.amQty ?? 0} / ${summary?.pmQty ?? 0}`} />
      <StatsCard title="Farmers" value={summary?.farmerCount ?? 0} icon={Users} formatValue={(v) => String(v)} />
      <StatsCard title="Gross value" value={summary?.grossAmount ?? 0} icon={Coins} />
      <StatsCard title="Avg FAT" value={summary?.avgFat ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
      <StatsCard title="Avg SNF" value={summary?.avgSnf ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
      <StatsCard title="Avg Water %" value={summary?.avgWater ?? 0} icon={FlaskConical} formatValue={(v) => (v > 0 ? v.toFixed(2) : '—')} />
      <StatsCard title="Pours" value={summary?.pourCount ?? 0} formatValue={(v) => String(v)} />
    </div>
  );
}

// ── QC report: hero + three trend charts + daily table ─────────────────────────
const QC_METRICS = [
  { key: 'fat' as const, label: 'FAT', color: '#10b981' },
  { key: 'snf' as const, label: 'SNF', color: '#3b82f6' },
  { key: 'water' as const, label: 'Water', color: '#f59e0b' },
];

function QcBarChart({ days, metric, color, label }: { days: QcDay[]; metric: 'fat' | 'snf' | 'water'; color: string; label: string }) {
  const data = days.filter((d) => d[metric] != null).map((d) => ({ day: dayNum(d.date), value: Number((d[metric] as number).toFixed(2)) }));
  return (
    <Card>
      <CardContent>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color }}>{label} (%)</p>
        {data.length === 0 ? (
          <div className="flex h-[140px] items-center justify-center text-xs text-zinc-400">No readings in this window</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={32} domain={['auto', 'auto']} />
              <Tooltip cursor={{ fill: 'rgba(161,161,170,0.12)' }} labelFormatter={(d) => `Day ${d}`} />
              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function QcReportView({ days, heroLabel, emptyHint }: { days: QcDay[]; heroLabel: string; emptyHint?: string }) {
  const total = days.reduce((a, d) => a + d.totalQty, 0);
  if (days.length === 0 || total === 0) {
    return <EmptyState icon={BarChart3} title="No quality data in this window" description={emptyHint ?? 'Record collection to see daily QC trends.'} />;
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{heroLabel}</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{total.toLocaleString()} L</p>
        </CardContent>
      </Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quality trends · qty-weighted</p>
      <div className="grid gap-3 md:grid-cols-3">
        {QC_METRICS.map((m) => <QcBarChart key={m.key} days={days} metric={m.key} color={m.color} label={m.label} />)}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><Th>Date</Th><Th align="right">L</Th><Th align="right">FAT</Th><Th align="right">SNF</Th><Th align="right">Water</Th></TableRow>
            </TableHeader>
            <TableBody>
              {days.filter((d) => d.totalQty > 0).map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="text-xs tabular-nums">{shortDate(d.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.totalQty.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.fat?.toFixed(1) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.snf?.toFixed(1) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.water?.toFixed(1) ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── generic day-grouped accordion (collection / dispatch / receive history) ────
export interface DayGroup<T> { date: string; rows: T[] }

/** Group rows by collectionDate, preserving the input order of first appearance. */
export function groupByDate<T>(rows: T[], getDate: (r: T) => string): DayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const d = getDate(r);
    (map.get(d) ?? map.set(d, []).get(d)!).push(r);
  }
  return [...map.entries()].map(([date, rs]) => ({ date, rows: rs }));
}

export function DayAccordion<T>({ groups, renderSummary, renderBody, emptyHint }: {
  groups: DayGroup<T>[];
  renderSummary: (g: DayGroup<T>) => ReactNode;
  renderBody: (g: DayGroup<T>) => ReactNode;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (groups.length === 0) return <EmptyState icon={Inbox} title="Nothing here yet" description={emptyHint ?? 'No records in this window.'} />;
  return (
    <Card>
      <CardContent className="p-0">
        {groups.map((g, i) => {
          const isOpen = open[g.date];
          return (
            <div key={g.date} className={i > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.date]: !o[g.date] }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                <span className="text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{shortDate(g.date)}</span>
                <span className="ml-auto text-sm text-zinc-500">{renderSummary(g)}</span>
              </button>
              {isOpen && <div className="px-4 pb-3">{renderBody(g)}</div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Filter pills (All / AM / PM, or any small option set). */
export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
