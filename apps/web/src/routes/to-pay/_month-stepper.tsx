import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from './_shared';

export function MonthStepper({ month, max, onChange }: {
  month: string;
  max: string;
  onChange: (month: string) => void;
}) {
  const btn = 'rounded-md border p-1.5 disabled:opacity-40';
  const style = { borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface)' };
  return (
    <div className="mb-4 flex items-center gap-3">
      <button type="button" className={btn} style={style} aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={14} />
      </button>
      <span className="min-w-[88px] text-center text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{monthLabel(month)}</span>
      <button type="button" className={btn} style={style} aria-label="Next month" disabled={month >= max} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
