import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import type { ContractDetail, ContractMember } from '@/hooks/queries/use-hr-contracts';

// Working-day calendar.
//
// The rule it renders: every day from the start date is worked unless it is
// marked otherwise. Only exceptions are stored, so a cell's state is
// derived — which is what keeps an open-ended contract correct with no
// background job writing rows.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type DayState = 'worked' | 'leave' | 'half_day' | 'outside';

const CELL: Record<DayState, string> = {
  worked: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  leave: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  half_day: 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200',
  outside: 'bg-muted/40 text-muted-foreground/50',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayOnly = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Earnings stop at the end date, or at today when the term is open — that
 * is the calendar's right-hand edge.
 */
export function lastAccrualDay(c: ContractDetail): string {
  const t = iso(new Date());
  if (!c.endDate) return t;
  return c.endDate < t ? c.endDate : t;
}

export function ContractCalendar({
  contract,
  onMark,
}: {
  contract: ContractDetail;
  onMark: (from: string, to: string, memberIds: string[] | null, current: DayState) => void;
}) {
  const last = lastAccrualDay(contract);
  const [month, setMonth] = useState(() => last.slice(0, 7));
  const [memberId, setMemberId] = useState<string | null>(null);
  const isCrew = contract.members.length > 1;

  const exceptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of contract.dayLog) m.set(`${d.memberId}|${d.logDate}`, d.status);
    return m;
  }, [contract.dayLog]);

  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  // Monday-first, matching every other calendar in HR.
  const leading = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;

  const startMonth = contract.startDate.slice(0, 7);
  const lastMonth = last.slice(0, 7);

  function stateFor(date: string, mid: string): DayState {
    if (date < contract.startDate || date > last) return 'outside';
    const s = exceptions.get(`${mid}|${date}`);
    if (s === 'leave') return 'leave';
    if (s === 'half_day') return 'half_day';
    return 'worked';
  }

  /** Crew reading: off only when everyone is, split otherwise. */
  function crewStateFor(date: string): { state: DayState; off: number } {
    if (date < contract.startDate || date > last) return { state: 'outside', off: 0 };
    let off = 0;
    let partial = 0;
    for (const m of contract.members) {
      const s = stateFor(date, m.id);
      if (s === 'leave') off++;
      if (s === 'half_day') partial++;
    }
    const state: DayState =
      off === contract.members.length ? 'leave' : off + partial > 0 ? 'half_day' : 'worked';
    return { state, off: off + partial };
  }

  function shift(delta: number) {
    const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
    setMonth(iso(d).slice(0, 7));
  }

  const target = isCrew ? memberId : contract.members[0]?.id ?? null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={month <= startMonth}
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm font-medium">
          {MONTHS[mo - 1]} {y}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={month >= lastMonth}
          onClick={() => shift(1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {isCrew && (
        <div className="mb-3 flex flex-wrap gap-1">
          <MemberChip label="Whole crew" on={memberId === null} onClick={() => setMemberId(null)} />
          {contract.members.map((m: ContractMember) => (
            <MemberChip
              key={m.id}
              label={m.name}
              on={memberId === m.id}
              onClick={() => setMemberId(m.id)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="pb-1 text-[10px] text-muted-foreground">{d}</div>
        ))}
        {Array.from({ length: leading }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNum = i + 1;
          const date = iso(new Date(Date.UTC(y, mo - 1, dayNum)));
          const reading = target ? null : crewStateFor(date);
          const state = target ? stateFor(date, target) : reading!.state;
          const off = reading?.off ?? 0;
          const disabled = state === 'outside' || contract.status !== 'active';
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() =>
                onMark(date, date, target ? [target] : contract.members.map((m) => m.id), state)
              }
              className={
                'relative aspect-square rounded-md text-xs font-medium transition-opacity ' +
                CELL[state] +
                (disabled ? ' cursor-default opacity-40' : ' hover:opacity-80')
              }
            >
              {dayNum}
              {off > 0 && !target && (
                <span className="absolute right-0.5 top-0 text-[9px] font-bold">−{off}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Legend cls={CELL.worked} label="Worked" />
        <Legend cls={CELL.leave} label="Leave" />
        <Legend cls={CELL.half_day} label="Half day" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Every day counts as worked from the start date. Click a day to mark leave
        or a half day.
      </p>
    </div>
  );
}

function MemberChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors ' +
        (on ? 'bg-primary/10 text-primary ring-1 ring-primary/40' : 'text-muted-foreground hover:bg-muted')
      }
    >
      {label}
    </button>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />
      {label}
    </span>
  );
}
