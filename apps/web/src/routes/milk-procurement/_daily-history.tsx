import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Card, CardContent, Combobox, Input, Pagination,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { Pills, shortDate, daysAgo, today } from './_node-dashboard-shared';

export const PAGE_SIZE = 25;

export type Preset = '7' | '14' | '30' | '90' | 'custom';
export const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

/** The daily columns shared by every history table (milk type / CC / VMCC). */
export interface MpDailyRow {
  date: string;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; grossAmount: number;
}

export function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  return preset === 'custom' ? custom : { from: daysAgo(Number(preset) - 1), to: today() };
}

/** Collapse per-node daily rows into one row per date (the "All nodes" view):
 * sum volumes / counts / gross and qty-weight the FAT/SNF, newest day first. */
export function sumDailyByDate(rows: MpDailyRow[]): MpDailyRow[] {
  const m = new Map<string, MpDailyRow & { fatW: number; fatQ: number; snfW: number; snfQ: number }>();
  for (const r of rows) {
    const e = m.get(r.date) ?? {
      date: r.date, totalQty: 0, amQty: 0, pmQty: 0, pourCount: 0, farmerCount: 0,
      avgFat: 0, avgSnf: 0, grossAmount: 0, fatW: 0, fatQ: 0, snfW: 0, snfQ: 0,
    };
    e.totalQty += r.totalQty; e.amQty += r.amQty; e.pmQty += r.pmQty;
    e.pourCount += r.pourCount; e.farmerCount += r.farmerCount; e.grossAmount += r.grossAmount;
    if (r.avgFat > 0) { e.fatW += r.avgFat * r.totalQty; e.fatQ += r.totalQty; }
    if (r.avgSnf > 0) { e.snfW += r.avgSnf * r.totalQty; e.snfQ += r.totalQty; }
    m.set(r.date, e);
  }
  return [...m.values()]
    .map(({ fatW, fatQ, snfW, snfQ, ...e }) => ({
      ...e,
      avgFat: fatQ > 0 ? Number((fatW / fatQ).toFixed(2)) : 0,
      avgSnf: snfQ > 0 ? Number((snfW / snfQ).toFixed(2)) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ── year / month / cycle range (half-month cycles: 1–15, 16–EOM) ─────────────
export type Cycle = '1' | '2';
export interface CycleState { year: string; month: string; cycle: Cycle }

const YEARS = Array.from({ length: 4 }, (_, i) => {
  const v = String(new Date().getFullYear() - i);
  return { value: v, label: v };
});
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' }),
}));
const CYCLES: { value: Cycle; label: string }[] = [
  { value: '1', label: '1–15' },
  { value: '2', label: '16–EOM' },
];

/** Current year / month, and the cycle today falls in (day ≤ 15 → first half). */
export function defaultCycleState(): CycleState {
  const d = new Date();
  return { year: String(d.getFullYear()), month: String(d.getMonth() + 1), cycle: d.getDate() <= 15 ? '1' : '2' };
}

/** The date window for a half-month cycle. EOM is derived per month. */
export function cycleRange({ year, month, cycle }: CycleState) {
  const y = Number(year);
  const m = Number(month);
  const mm = String(m).padStart(2, '0');
  if (cycle === '1') return { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` };
  const eom = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this
  return { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(eom).padStart(2, '0')}` };
}

/** Year / month / cycle dropdowns. `onChange` receives the patched state so the
 * caller can also reset pagination. */
export function CycleFilter({ value, onChange }: {
  value: CycleState;
  onChange: (next: CycleState) => void;
}) {
  const set = (patch: Partial<CycleState>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="w-28">
        <Combobox label="Year" value={value.year} onChange={(v) => set({ year: v })} options={YEARS} />
      </div>
      <div className="w-40">
        <Combobox label="Month" value={value.month} onChange={(v) => set({ month: v })} options={MONTHS} />
      </div>
      <div className="w-40">
        <Combobox label="Cycle" value={value.cycle} onChange={(v) => set({ cycle: v as Cycle })} options={CYCLES} />
      </div>
    </>
  );
}

/** Preset pills + custom range inputs. `onChange` fires after any change so the
 * caller can reset pagination. */
export function RangePills({ preset, custom, setPreset, setCustom, onChange }: {
  preset: Preset;
  custom: { from: string; to: string };
  setPreset: (p: Preset) => void;
  setCustom: (c: { from: string; to: string }) => void;
  onChange: () => void;
}) {
  return (
    <>
      <Pills value={preset} onChange={(v) => { setPreset(v); onChange(); }} options={PRESETS} />
      {preset === 'custom' && (
        <div className="flex items-end gap-2">
          <Input label="From" type="date" value={custom.from} max={custom.to}
            onChange={(e) => { setCustom({ ...custom, from: e.target.value }); onChange(); }} />
          <Input label="To" type="date" value={custom.to} max={today()}
            onChange={(e) => { setCustom({ ...custom, to: e.target.value }); onChange(); }} />
        </div>
      )}
    </>
  );
}

/** Daily AM / PM / Total volume across the window, plotted oldest day first. */
export function DailyQtyChart({ rows }: { rows: MpDailyRow[] }) {
  const data = [...rows]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ date: shortDate(r.date), AM: r.amQty, PM: r.pmQty, Total: r.totalQty }));
  if (data.length === 0) return null;
  return (
    <Card className="mb-4">
      <CardContent>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Daily volume (L)</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => `${Number(v).toLocaleString()} L`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Total" stroke="#0F7A5A" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="AM" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="PM" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Client-paginated daily table, 25 rows/page. */
export function DailyTable({ rows, page, setPage }: {
  rows: MpDailyRow[]; page: number; setPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Date</Th>
              <Th align="right">Qty (L)</Th>
              <Th align="right">AM / PM</Th>
              <Th align="right">Farmers</Th>
              <Th align="right">Pours</Th>
              <Th align="right">Avg FAT</Th>
              <Th align="right">Avg SNF</Th>
              <Th align="right">Gross payable</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableEmpty colSpan={8} message="No pours in the selected window." />
            ) : (
              pageRows.map((r) => <DayRow key={r.date} r={r} />)
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
            <Pagination page={safePage} totalPages={totalPages} total={rows.length}
              limit={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DayRow({ r }: { r: MpDailyRow }) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{shortDate(r.date)}</TableCell>
      <TableCell align="right" numeric>{r.totalQty.toLocaleString()}</TableCell>
      <TableCell align="right" numeric>{r.amQty} / {r.pmQty}</TableCell>
      <TableCell align="right" numeric>{r.farmerCount}</TableCell>
      <TableCell align="right" numeric>{r.pourCount}</TableCell>
      <TableCell align="right" numeric>{r.avgFat > 0 ? r.avgFat.toFixed(2) : '—'}</TableCell>
      <TableCell align="right" numeric>{r.avgSnf > 0 ? r.avgSnf.toFixed(2) : '—'}</TableCell>
      <TableCell align="right" numeric>{formatINR(r.grossAmount)}</TableCell>
    </TableRow>
  );
}
