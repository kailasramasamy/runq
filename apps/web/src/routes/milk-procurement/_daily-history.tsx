import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Pencil } from 'lucide-react';
import {
  Card, CardContent, Combobox, Input, Pagination, Button,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { Pills, shortDate, daysAgo, today } from './_node-dashboard-shared';

export const PAGE_SIZE = 25;

/** One QC reading, blank when absent (a 0 average means no sample). */
const q1 = (v: number) => (v > 0 ? v.toFixed(1) : '—');
/** "am / pm" pair for a per-shift QC column. */
const shiftPair = (am: number, pm: number) => `${q1(am)} / ${q1(pm)}`;

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
  farmerCount: number; avgFat: number; avgSnf: number;
  amFat: number; pmFat: number; amSnf: number; pmSnf: number;
  amRate: number; pmRate: number; avgWater: number; amWater: number; pmWater: number;
  grossAmount: number;
}

export function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  return preset === 'custom' ? custom : { from: daysAgo(Number(preset) - 1), to: today() };
}

/** Collapse per-node daily rows into one row per date (the "All nodes" view):
 * sum volumes / counts / gross and qty-weight the FAT/SNF, newest day first. */
export function sumDailyByDate(rows: MpDailyRow[]): MpDailyRow[] {
  // Each QC metric carries a weighted sum + the litres behind it, so the daily
  // average is qty-weighted; per-shift metrics weight by that shift's litres.
  type Acc = MpDailyRow & Record<'wSum' | 'wQty', Record<string, number>>;
  const metrics = [
    ['avgFat', 'totalQty'], ['avgSnf', 'totalQty'], ['avgWater', 'totalQty'],
    ['amFat', 'amQty'], ['pmFat', 'pmQty'], ['amSnf', 'amQty'], ['pmSnf', 'pmQty'],
    ['amRate', 'amQty'], ['pmRate', 'pmQty'], ['amWater', 'amQty'], ['pmWater', 'pmQty'],
  ] as const;
  const m = new Map<string, Acc>();
  for (const r of rows) {
    const e = m.get(r.date) ?? {
      date: r.date, totalQty: 0, amQty: 0, pmQty: 0, pourCount: 0, farmerCount: 0,
      avgFat: 0, avgSnf: 0, amFat: 0, pmFat: 0, amSnf: 0, pmSnf: 0, amRate: 0, pmRate: 0, avgWater: 0, amWater: 0, pmWater: 0,
      grossAmount: 0, wSum: {}, wQty: {},
    };
    e.totalQty += r.totalQty; e.amQty += r.amQty; e.pmQty += r.pmQty;
    e.pourCount += r.pourCount; e.farmerCount += r.farmerCount; e.grossAmount += r.grossAmount;
    for (const [metric, qtyKey] of metrics) {
      if (r[metric] > 0) { e.wSum[metric] = (e.wSum[metric] ?? 0) + r[metric] * r[qtyKey]; e.wQty[metric] = (e.wQty[metric] ?? 0) + r[qtyKey]; }
    }
    m.set(r.date, e);
  }
  return [...m.values()]
    .map(({ wSum, wQty, ...e }) => {
      for (const [metric] of metrics) e[metric] = wQty[metric] ? Number((wSum[metric] / wQty[metric]).toFixed(2)) : 0;
      return e;
    })
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

/** Dark-mode-aware chart tooltip (recharts' default is a hard-coded white box,
 * so the label washes out on dark backgrounds). Colours each series by its line. */
export function ChartTooltip({ active, payload, label, unit = '' }: {
  active?: boolean; label?: string | number; unit?: string;
  payload?: { name?: string | number; value?: number | string; color?: string }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 font-medium text-zinc-600 dark:text-zinc-300">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums" style={{ color: p.color }}>
          {p.name} : {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{unit}
        </p>
      ))}
    </div>
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
            <Tooltip content={<ChartTooltip unit=" L" />} />
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

const AM_COLOR = '#f59e0b', PM_COLOR = '#3b82f6';

/** One QC trend chart — plots the given day series, oldest day first, with a
 * fixed Y floor so small variation reads clearly (a 0 reading is skipped). */
function QcChart({ rows, title, min, series }: {
  rows: MpDailyRow[]; title: string; min: number;
  series: { key: keyof MpDailyRow; name: string; color: string }[];
}) {
  const data = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => {
    const o: Record<string, number | string> = { date: shortDate(r.date) };
    for (const s of series) { const v = Number(r[s.key]); if (v > 0) o[s.name] = v; }
    return o;
  });
  return (
    <Card>
      <CardContent>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-xs text-zinc-400">No readings</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={36}
                tickFormatter={(v) => v.toFixed(1)} domain={[min, 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** FAT / SNF / Water daily trends in a 3-column grid (AM vs PM for FAT & SNF).
 * Floors match the home quality trends: FAT 3, SNF 7, Water 0. */
export function DailyQualityCharts({ rows }: { rows: MpDailyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-3">
      <QcChart rows={rows} title="FAT %" min={3} series={[
        { key: 'amFat', name: 'AM', color: AM_COLOR }, { key: 'pmFat', name: 'PM', color: PM_COLOR },
      ]} />
      <QcChart rows={rows} title="SNF %" min={7} series={[
        { key: 'amSnf', name: 'AM', color: AM_COLOR }, { key: 'pmSnf', name: 'PM', color: PM_COLOR },
      ]} />
      <QcChart rows={rows} title="Water %" min={0} series={[
        { key: 'amWater', name: 'AM', color: AM_COLOR }, { key: 'pmWater', name: 'PM', color: PM_COLOR },
      ]} />
    </div>
  );
}

/** Client-paginated daily table, 25 rows/page. */
export function DailyTable({ rows, page, setPage, onEditDay }: {
  rows: MpDailyRow[]; page: number; setPage: (p: number) => void;
  /** When set, shows an Edit action per day (correct that day's pours). */
  onEditDay?: (date: string) => void;
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
              <Th align="right">FAT AM/PM</Th>
              <Th align="right">SNF AM/PM</Th>
              <Th align="right">Water AM/PM</Th>
              <Th align="right">₹/L AM/PM</Th>
              <Th align="right">Gross payable</Th>
              {onEditDay && <Th align="right">Action</Th>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableEmpty colSpan={onEditDay ? 11 : 10} message="No pours in the selected window." />
            ) : (
              pageRows.map((r) => <DayRow key={r.date} r={r} onEdit={onEditDay && (() => onEditDay(r.date))} />)
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

/** A daily row tagged with its node — the "All nodes" table lists these
 * individually (one line per node per day) rather than summing them. */
export interface MpNodeDailyRow extends MpDailyRow { nodeId: string; nodeName: string; nodeCode: string }

/** Per-(day, node) table with a node column — the "All VMCCs / All CCs" view.
 * Rows arrive pre-sorted; paginated 25/page like DailyTable. */
export function NodeDailyTable({ rows, page, setPage, nodeLabel, onEditRow }: {
  rows: MpNodeDailyRow[]; page: number; setPage: (p: number) => void; nodeLabel: string;
  /** When set, shows an Edit action per (node, day). */
  onEditRow?: (nodeId: string, date: string) => void;
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
              <Th>{nodeLabel}</Th>
              <Th align="right">Qty (L)</Th>
              <Th align="right">AM / PM</Th>
              <Th align="right">Farmers</Th>
              <Th align="right">Pours</Th>
              <Th align="right">FAT AM/PM</Th>
              <Th align="right">SNF AM/PM</Th>
              <Th align="right">Water AM/PM</Th>
              <Th align="right">₹/L AM/PM</Th>
              <Th align="right">Gross payable</Th>
              {onEditRow && <Th align="right">Action</Th>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableEmpty colSpan={onEditRow ? 12 : 11} message="No pours in the selected window." />
            ) : (
              pageRows.map((r) => (
                <TableRow key={`${r.date}|${r.nodeId}`}>
                  <TableCell className="tabular-nums">{shortDate(r.date)}</TableCell>
                  <TableCell>{r.nodeCode} · {r.nodeName}</TableCell>
                  <TableCell align="right" numeric>{r.totalQty.toLocaleString()}</TableCell>
                  <TableCell align="right" numeric>{r.amQty} / {r.pmQty}</TableCell>
                  <TableCell align="right" numeric>{r.farmerCount}</TableCell>
                  <TableCell align="right" numeric>{r.pourCount}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amFat, r.pmFat)}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amSnf, r.pmSnf)}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amWater, r.pmWater)}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amRate, r.pmRate)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(r.grossAmount)}</TableCell>
                  {onEditRow && (
                    <TableCell align="right">
                      <Button size="sm" variant="ghost" onClick={() => onEditRow(r.nodeId, r.date)}>
                        <Pencil size={14} className="mr-1" />Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
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

function DayRow({ r, onEdit }: { r: MpDailyRow; onEdit?: () => void }) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{shortDate(r.date)}</TableCell>
      <TableCell align="right" numeric>{r.totalQty.toLocaleString()}</TableCell>
      <TableCell align="right" numeric>{r.amQty} / {r.pmQty}</TableCell>
      <TableCell align="right" numeric>{r.farmerCount}</TableCell>
      <TableCell align="right" numeric>{r.pourCount}</TableCell>
      <TableCell align="right" numeric>{shiftPair(r.amFat, r.pmFat)}</TableCell>
      <TableCell align="right" numeric>{shiftPair(r.amSnf, r.pmSnf)}</TableCell>
      <TableCell align="right" numeric>{q1(r.avgWater)}</TableCell>
      <TableCell align="right" numeric>{shiftPair(r.amRate, r.pmRate)}</TableCell>
      <TableCell align="right" numeric>{formatINR(r.grossAmount)}</TableCell>
      {onEdit && (
        <TableCell align="right">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={14} className="mr-1" />Edit</Button>
        </TableCell>
      )}
    </TableRow>
  );
}
