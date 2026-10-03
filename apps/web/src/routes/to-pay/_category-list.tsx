import { formatINR } from '@/lib/utils';
import type { ToPayCategory, ToPayCategorySummary } from '@/hooks/queries/use-to-pay';
import { CATEGORY_ICON } from './_shared';

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--pos)' }} />
    </div>
  );
}

function Figures({ c, monthMode }: { c: ToPayCategorySummary; monthMode: boolean }) {
  if (!monthMode) {
    return (
      <>
        {c.overdue > 0 && <span className="text-[11.5px]" style={{ color: 'var(--neg)' }}>{formatINR(c.overdue)} overdue</span>}
        <span className="num text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(c.balance)}</span>
      </>
    );
  }
  return (
    <div className="text-right">
      <div className="num text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
        {formatINR(c.paid)} / {formatINR(c.total)}
      </div>
      {c.balance > 0 && <div className="text-[11.5px]" style={{ color: 'var(--warn)' }}>{formatINR(c.balance)} pending</div>}
    </div>
  );
}

export function CategoryList({ categories, selected, onSelect, monthMode }: {
  categories: ToPayCategorySummary[];
  selected: ToPayCategory | null;
  onSelect: (key: ToPayCategory | null) => void;
  monthMode: boolean;
}) {
  return (
    <div className="mb-5 rounded-lg border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>By category</span>
        {selected && (
          <button type="button" className="text-[12px] font-medium" style={{ color: 'var(--accent-text)' }} onClick={() => onSelect(null)}>
            All
          </button>
        )}
      </div>
      {categories.map((c) => {
        const Icon = CATEGORY_ICON[c.key];
        const active = selected === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(active ? null : c.key)}
            className="flex w-full items-center gap-3 border-t px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
            style={{ borderColor: 'var(--border)', background: active ? 'var(--accent-soft)' : undefined }}
          >
            <span style={{ color: 'var(--text-3)' }}><Icon size={16} /></span>
            <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
              {c.label}
              <span className="ml-2 text-[11.5px] font-normal" style={{ color: 'var(--text-3)' }}>
                {monthMode ? `${c.paidCount} of ${c.count} paid` : c.count}
              </span>
              {monthMode && <ProgressBar paid={c.paid} total={c.total} />}
            </span>
            <Figures c={c} monthMode={monthMode} />
          </button>
        );
      })}
    </div>
  );
}
