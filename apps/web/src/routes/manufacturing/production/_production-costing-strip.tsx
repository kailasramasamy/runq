/**
 * Bottom-sticky costing strip for Record Production — mirrors
 * manufacturing/wos/_run-costing-strip.tsx but summarizes the backflush
 * preview (estimated input value) instead of a live WO run.
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { Skeleton } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ProductionPreview } from '@runq/types';

interface Props {
  preview: ProductionPreview | null | undefined;
  isLoading: boolean;
}

export function ProductionCostingStrip({ preview, isLoading }: Props) {
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
            value={isLoading ? null : formatINR(preview?.estimatedInputValue ?? 0)}
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
