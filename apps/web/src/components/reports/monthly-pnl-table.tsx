import { useState } from 'react';
import type { MonthlyPnl, MonthlyPnlRow } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import { MonthlyPnlDrilldown, type DrillTarget } from './monthly-pnl-drilldown';

/** Opens the entries behind a cell: a month, or the whole period for the Total column. */
type Drill = (row: MonthlyPnlRow, month: string | null) => void;

const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });

function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00`));
}

const SECTION_SIGN: Record<string, string> = { revenue: '', expenses: '−', nonOperating: '+' };

function Cell({ amount, className = '', onClick }: { amount: number; className?: string; onClick?: () => void }) {
  const clickable = onClick && amount !== 0;
  return (
    <td title={formatINR(amount)} className={`px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${className}`}>
      {amount === 0 ? '—' : clickable ? (
        <button onClick={onClick} className="underline decoration-dotted decoration-zinc-300 underline-offset-4 hover:text-indigo-600 hover:decoration-indigo-400 dark:decoration-zinc-600 dark:hover:text-indigo-400">
          {formatINRShort(amount)}
        </button>
      ) : formatINRShort(amount)}
    </td>
  );
}

type RowVariant = 'line' | 'total' | 'profit' | 'official';

/** The official-books figure sits in a muted blue-grey band so it isn't read as the internal profit. */
const OFFICIAL_BG = 'bg-slate-100 dark:bg-slate-800';

function Row({ row, variant, months, onDrill }: {
  row: MonthlyPnlRow; variant: RowVariant; months: string[]; onDrill?: Drill;
}) {
  const official = variant === 'official';
  const label = {
    line: 'pl-6 text-zinc-600 dark:text-zinc-400',
    total: 'font-semibold text-zinc-800 dark:text-zinc-200',
    profit: 'font-bold text-zinc-900 dark:text-zinc-100',
    official: 'italic font-medium text-slate-500 dark:text-slate-400',
  }[variant];
  const tone = (v: number) => {
    if (official) return 'italic text-slate-500 dark:text-slate-400';
    if (variant !== 'profit') return '';
    return v >= 0 ? 'font-bold text-green-600 dark:text-green-400' : 'font-bold text-red-600 dark:text-red-400';
  };
  const border = variant === 'line' ? ''
    : official ? `border-t border-dashed border-slate-300 dark:border-slate-600 ${OFFICIAL_BG}`
    : 'border-t border-zinc-200 dark:border-zinc-700';
  const stickyBg = official ? OFFICIAL_BG : 'bg-white dark:bg-zinc-900';
  return (
    <tr className={border}>
      <td className={`sticky left-0 ${stickyBg} px-3 py-1.5 whitespace-nowrap ${label}`}>{row.label}</td>
      {row.values.map((v, i) => (
        <Cell key={i} amount={v} className={`${tone(v)} ${variant === 'total' ? 'font-semibold' : ''}`}
          onClick={onDrill && (() => onDrill(row, months[i]!))} />
      ))}
      <Cell amount={row.total} className={`${official ? OFFICIAL_BG : 'bg-zinc-50 dark:bg-zinc-800/50'} ${tone(row.total) || 'font-semibold'}`}
        onClick={onDrill && (() => onDrill(row, null))} />
    </tr>
  );
}

function SectionHeading({ label, sign, span }: { label: string; sign: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="sticky left-0 bg-white dark:bg-zinc-900 px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {sign && <span className="mr-1">{sign}</span>}{label}
      </td>
    </tr>
  );
}

/** Month-by-month management P&L: months across, the owner's cost lines down. */
function drillTarget(report: MonthlyPnl, row: MonthlyPnlRow, month: string | null): DrillTarget {
  const { from, to } = report.period;
  if (!month) return { key: row.key, label: row.label, periodLabel: `${from} to ${to}`, from, to };
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return {
    key: row.key, label: row.label, periodLabel: monthLabel(month),
    from: monthStart > from ? monthStart : from,
    to: monthEnd < to ? monthEnd : to,
  };
}

export function MonthlyPnlTable({ report }: { report: MonthlyPnl }) {
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const onDrill: Drill = (row, month) => setDrill(drillTarget(report, row, month));
  const rowProps = { months: report.months };
  const span = report.months.length + 2;
  const booked = report.profitBookedAsExpense.total !== 0;
  const provisional = new Set(report.provisionalMonths);
  const section = (key: string) => report.sections.find((s) => s.key === key)!;
  const hasMilk = section('expenses').lines.some((l) => l.key === 'milk');
  const block = (key: string) => {
    const s = section(key);
    if (s.lines.length === 0) return null;
    return [
      <SectionHeading key={`${key}-h`} label={s.label} sign={SECTION_SIGN[key] ?? ''} span={span} />,
      ...s.lines.map((l) => <Row key={l.key} row={l} variant="line" {...rowProps} onDrill={onDrill} />),
      <Row key={`${key}-t`} row={s.totals} variant="total" {...rowProps} />,
    ];
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500">
              <th className="sticky left-0 bg-white dark:bg-zinc-900 px-3 py-2 text-left font-medium" />
              {report.months.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {monthLabel(m)}{provisional.has(m) && '*'}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium bg-zinc-50 dark:bg-zinc-800/50">Total</th>
            </tr>
          </thead>
          <tbody>
            {block('revenue')}
            {block('expenses')}
            <Row row={report.operatingProfit} variant="profit" {...rowProps} />
            {block('nonOperating')}
            {(section('nonOperating').lines.length > 0 || booked) && <Row row={report.netProfit} variant="profit" {...rowProps} />}
            {booked && [
              <SectionHeading key="went-h" label="Where the profit went" sign="" span={span} />,
              <Row key="booked" row={report.profitBookedAsExpense} variant="line" {...rowProps} onDrill={onDrill} />,
              <Row key="retained" row={report.profitRetained} variant="official" {...rowProps} />,
            ]}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          {hasMilk && 'Milk is costed by pour date; bulk VMCC milk by its billing cycle. '}
          {hasMilk ? 'Other costs' : 'Costs'} fall in the month they were billed or paid.
        </p>
        {provisional.size > 0 && <p>* Milk cost incomplete — a VMCC billing cycle in this month is not billed yet.</p>}
        {report.excludedStock.total !== 0 && (
          <p>
            Stock movements of{' '}
            <button onClick={() => onDrill(report.excludedStock, null)} className="underline decoration-dotted underline-offset-4 hover:text-indigo-600 dark:hover:text-indigo-400">
              {formatINRShort(report.excludedStock.total)}
            </button>{' '}
            (cost of goods dispatched, write-offs, stock adjustments) are left out — purchases are already counted when bought.
          </p>
        )}
        <p>Click any amount to see the entries behind it. In an expense breakdown, “Not an expense” moves an entry you booked as an expense for the books into “Where the profit went”.</p>
      </div>
      <MonthlyPnlDrilldown target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
