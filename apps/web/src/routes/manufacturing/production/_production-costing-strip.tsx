/**
 * Bottom-sticky costing strip for Record Production — mirrors
 * manufacturing/wos/_run-costing-strip.tsx but summarizes the backflush
 * preview (estimated input value) instead of a live WO run.
 *
 * The input value is priced from the split the operator typed, not the
 * server's own allocation: they are what will actually post, and a strip that
 * quoted a different number would be quoting a run nobody is making.
 *
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { Skeleton } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ProductionPreview } from '@runq/types';
import { enteredQty, type DrawDraft } from './_production-lines';

interface Props {
  preview: ProductionPreview | null | undefined;
  draft: DrawDraft;
  isLoading: boolean;
}

/** Sum of entered qty × the batch's unit cost, across every line. */
function drawnValue(preview: ProductionPreview | null | undefined, draft: DrawDraft): number {
  if (!preview) return 0;
  const total = preview.allocations.reduce(
    (sum, a) => sum + a.pool.reduce((n, b) => n + enteredQty(draft, b) * b.unitCost, 0),
    0,
  );
  return Math.round(total * 100) / 100;
}

export function ProductionCostingStrip({ preview, draft, isLoading }: Props) {
  return (
    <div
      className="sticky bottom-0 z-20 border-t shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.12)]"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
    >
      <div
        className="mx-auto max-w-7xl px-4 pt-3 sm:px-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell
            label="Output"
            value={isLoading ? null : preview ? `${preview.producedQty.toFixed(3)} ${preview.outputUom}` : '—'}
          />
          <Cell label="BOM runs" value={isLoading ? null : preview ? preview.runs.toFixed(3) : '—'} />
          <Cell
            label="Estimated input value"
            value={isLoading ? null : formatINR(drawnValue(preview, draft))}
          />
          <Cell label="Warehouse" value={isLoading ? null : preview?.warehouseName ?? '—'} />
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      {value === null ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
          {value}
        </span>
      )}
    </div>
  );
}
