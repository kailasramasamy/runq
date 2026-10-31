import { useMemo, useState } from 'react';
import type { MonthlyPnlEntry } from '@runq/types';
import { Modal, TableSkeleton } from '@/components/ui';
import { useMonthlyPnlLine, useProfitMark } from '@/hooks/queries/use-reports';
import { formatINR } from '@/lib/utils';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const formatDate = (iso: string) => DATE_FMT.format(new Date(`${iso}T00:00:00`));

export interface DrillTarget {
  key: string;
  label: string;
  periodLabel: string;
  from: string;
  to: string;
}

type SortBy = 'date' | 'amount';

/** Subtotals by account — answers "what is this number made of" before the line list. */
function ByAccount({ entries }: { entries: MonthlyPnlEntry[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, { amount: number; count: number }>();
    for (const e of entries) {
      const g = m.get(e.account) ?? { amount: 0, count: 0 };
      m.set(e.account, { amount: g.amount + e.amount, count: g.count + 1 });
    }
    return [...m].sort((a, b) => b[1].amount - a[1].amount);
  }, [entries]);
  if (groups.length < 2) return null;
  return (
    <div className="mb-3 grid gap-1 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
      {groups.map(([account, g]) => (
        <div key={account} className="flex justify-between gap-4">
          <span className="text-zinc-600 dark:text-zinc-400">{account} <span className="text-zinc-400 dark:text-zinc-500">· {g.count}</span></span>
          <span className="font-mono tabular-nums">{formatINR(g.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function Party({ entry }: { entry: MonthlyPnlEntry }) {
  if (!entry.party) return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  if (!entry.partyFromBank) return <span className="text-zinc-800 dark:text-zinc-200">{entry.party}</span>;
  return (
    <span className="italic text-zinc-500 dark:text-zinc-400" title="Read from the bank narration — no vendor linked to this payment">
      {entry.party}
    </span>
  );
}

const PROFIT_BOOKED_KEY = 'profitBookedAsExpense';

/** Moves an entry between its expense line and "Booked as expense" — internal P&L only. */
function MarkButton({ entry, booked }: { entry: MonthlyPnlEntry; booked: boolean }) {
  const { mark, unmark } = useProfitMark();
  if (!entry.markable || !entry.ref) return null;
  const busy = mark.isPending || unmark.isPending;
  const run = () => (booked ? unmark : mark).mutate(entry.ref!);
  return (
    <button onClick={run} disabled={busy}
      title={booked ? 'Count this as an expense again' : 'Booked as an expense for the books, but really profit taken out'}
      className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
      {booked ? 'Count as expense' : 'Not an expense'}
    </button>
  );
}

function EntryTable({ entries, partyLabel, booked }: { entries: MonthlyPnlEntry[]; partyLabel: string; booked: boolean }) {
  const actions = entries.some((e) => e.markable);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">{partyLabel}</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="py-2 text-right font-medium">Amount</th>
            {actions && <th className="py-2 pl-3" />}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.ref ? `${e.ref.journalEntryId}:${e.ref.accountId}` : i} className="border-b border-zinc-100 align-top dark:border-zinc-800">
              <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-500">{formatDate(e.date)}</td>
              <td className="py-1.5 pr-3 min-w-[9rem] break-words"><Party entry={e} /></td>
              <td className="py-1.5 pr-3 text-zinc-800 dark:text-zinc-200">
                <div className="break-words">{e.description}</div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500">{e.account}</div>
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-500">{e.source}</td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatINR(e.amount)}</td>
              {actions && <td className="py-1.5 pl-3 text-right"><MarkButton entry={e} booked={booked} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every entry behind one cell of the monthly P&L. */
export function MonthlyPnlDrilldown({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const { data, isLoading } = useMonthlyPnlLine(target?.key ?? null, target?.from ?? '', target?.to ?? '');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const detail = data?.data;
  const entries = useMemo(() => {
    const list = [...(detail?.entries ?? [])];
    return sortBy === 'amount' ? list.sort((a, b) => b.amount - a.amount) : list;
  }, [detail, sortBy]);

  return (
    <Modal open={!!target} onClose={onClose} size="xl" title={target ? `${target.label} · ${target.periodLabel}` : ''}>
      {isLoading || !detail ? (
        <table className="w-full"><tbody><TableSkeleton rows={8} /></tbody></table>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(detail.total)}</div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {detail.entries.length} entries · sort by
              {(['date', 'amount'] as const).map((s) => (
                <button key={s} onClick={() => setSortBy(s)} aria-pressed={sortBy === s}
                  className={`rounded px-2 py-0.5 ${sortBy === s ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ByAccount entries={detail.entries} />
          {detail.key === PROFIT_BOOKED_KEY && (
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Booked as expenses in the books, counted here as profit taken out. The official P&L still treats them as expenses.
            </p>
          )}
          <EntryTable entries={entries} partyLabel={detail.partyLabel} booked={detail.key === PROFIT_BOOKED_KEY} />
          {detail.entries.some((e) => e.partyFromBank) && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="italic">Italic</span> names are read from the bank narration — no vendor is linked to that payment.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
