/**
 * Bottom-sticky costing preview strip for the WO Run view.
 * Shows consumed value, actual vs expected qty, per-unit cost, and variance.
 * Spec: docs/manufacturing-plan.md §8.
 */
import { Skeleton } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { WoCostingPreview } from '@runq/types';

const ACCENT = '#E11D48';

interface Props {
  preview: WoCostingPreview | null | undefined;
  isLoading: boolean;
  outputUom: string;
}

export function RunCostingStrip({ preview, isLoading, outputUom }: Props) {
  const varianceQty = preview?.varianceQty ?? 0;
  const varianceValue = preview?.varianceValue ?? 0;
  const isPositive = varianceQty >= 0;

  return (
    <div
      className="sticky bottom-0 z-20 border-t shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.12)]"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
    >
      <div
        className="mx-auto max-w-7xl px-4 pt-3 sm:px-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <CostCell
            label="Consumed value"
            value={isLoading ? null : formatINR(preview?.consumedValue ?? 0)}
          />
          <CostCell
            label="Output qty"
            value={
              isLoading
                ? null
                : `${(preview?.actualOutputQty ?? 0).toFixed(3)} / ${(preview?.expectedOutputQty ?? 0).toFixed(3)} ${outputUom}`
            }
          />
          <CostCell
            label="Per-unit cost"
            value={isLoading ? null : formatINR(preview?.perUnitOutputCost ?? 0)}
          />
          <CostCell
            label="Variance qty"
            value={
              isLoading
                ? null
                : `${isPositive ? '+' : ''}${(varianceQty).toFixed(3)} ${outputUom}`
            }
            tone={isLoading ? 'neutral' : varianceQty === 0 ? 'neutral' : isPositive ? 'green' : 'amber'}
          />
          <CostCell
            label="Variance value (reporting only)"
            value={isLoading ? null : `${isPositive ? '+' : ''}${formatINR(varianceValue)}`}
            tone={isLoading ? 'neutral' : varianceQty === 0 ? 'neutral' : isPositive ? 'green' : 'amber'}
            muted
          />
        </div>
      </div>
    </div>
  );
}

function CostCell({
  label,
  value,
  tone = 'neutral',
  muted,
}: {
  label: string;
  value: string | null;
  tone?: 'neutral' | 'green' | 'amber';
  muted?: boolean;
}) {
  const toneColor =
    tone === 'green'
      ? '#16a34a'
      : tone === 'amber'
        ? '#d97706'
        : muted
          ? 'var(--text-3)'
          : 'var(--text-1)';

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      {value === null ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <span
          className="font-mono text-[12px] font-semibold tabular-nums"
          style={{ color: toneColor }}
        >
          {value}
        </span>
      )}
    </div>
  );
}
