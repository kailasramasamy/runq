/**
 * Backflushed consumption table for Record Production — one card per BOM
 * input, FEFO-allocated batches, editable qty/batch that feeds back into
 * `lines[]` on the next preview call. Mirrors the visual language of
 * manufacturing/wos/_run-inputs.tsx.
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, PackageSearch } from 'lucide-react';
import { Card, CardHeader, CardContent, Input, EmptyState, Skeleton } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ProductionAllocation, ProductionAllocationBatch, ProductionShortage } from '@runq/types';

export type LineBatchDraft = { batchNo: string | null; qty: number };

interface Props {
  allocations: ProductionAllocation[];
  shortages: ProductionShortage[];
  isLoading: boolean;
  hasQuery: boolean;
  onLineChange: (inputItemId: string, batches: LineBatchDraft[]) => void;
}

export function ProductionLinesPanel({ allocations, shortages, isLoading, hasQuery, onLineChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Backflushed inputs
      </p>

      {shortages.length > 0 && <ShortageBanner shortages={shortages} />}

      {!hasQuery ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to preview yet"
          description="Pick a BOM, produced qty, and warehouse to see what gets consumed."
        />
      ) : isLoading ? (
        <Card><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
      ) : allocations.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No input lines" description="This BOM has no input lines to backflush." />
      ) : (
        allocations.map((a) => (
          <AllocationCard key={a.bomLineId ?? a.inputItemId} allocation={a} onLineChange={onLineChange} />
        ))
      )}
    </div>
  );
}

function ShortageBanner({ shortages }: { shortages: ProductionShortage[] }) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-[12.5px]"
      style={{ background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)', color: '#dc2626' }}
    >
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertTriangle size={14} /> Insufficient stock — cannot post
      </div>
      <ul className="list-disc space-y-0.5 pl-5">
        {shortages.map((s, i) => (
          <li key={`${s.inputItemId}-${i}`}>
            {s.inputItemName} — short {s.shortQty.toFixed(3)} {s.uom}
            {' '}(need {s.requiredQty.toFixed(3)}, have {s.availableQty.toFixed(3)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function AllocationCard({
  allocation,
  onLineChange,
}: {
  allocation: ProductionAllocation;
  onLineChange: Props['onLineChange'];
}) {
  const [rows, setRows] = useState<ProductionAllocationBatch[]>(allocation.batches);
  const balanceAfter =
    allocation.availableQty - rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  // Re-sync from the server's echoed allocation on every fresh preview —
  // it reflects exactly what will be consumed given the overrides we sent.
  useEffect(() => { setRows(allocation.batches); }, [allocation.batches]);

  function updateRow(idx: number, patch: Partial<LineBatchDraft>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setRows(next);
    // Overrides are keyed by item, and a line that accepts substitutes can draw
    // from several — so each item's rows are sent as its own override set.
    const edited = next[idx]!;
    onLineChange(
      edited.itemId,
      next.filter((r) => r.itemId === edited.itemId).map((r) => ({ batchNo: r.batchNo, qty: r.qty })),
    );
  }

  return (
    <Card>
      <CardHeader
        title={allocation.inputItemName}
        action={
          allocation.isOptional ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Optional
            </span>
          ) : null
        }
      />
      <CardContent>
        {/* The line will take any of these, so its "in stock" counts them all. */}
        {allocation.substitutes.length > 0 && (
          <p className="mb-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            or {allocation.substitutes.map((s) => s.itemName).join(' / ')}
          </p>
        )}
        <div className="mb-2 flex justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
          <span>Required: {allocation.requiredQty.toFixed(3)} {allocation.uom}</span>
          <span>In stock: {allocation.availableQty.toFixed(3)} {allocation.uom}</span>
        </div>
        {/* What is left once this run draws its share — the figure that tells
            the floor whether another run can follow. */}
        <div className="mb-2 flex justify-end text-[11px]" style={{ color: 'var(--text-3)' }}>
          <span>
            Balance after:{' '}
            <span
              className="font-semibold"
              style={{ color: balanceAfter <= 0.0001 ? '#dc2626' : 'var(--text-1)' }}
            >
              {Math.max(balanceAfter, 0).toFixed(3)} {allocation.uom}
            </span>
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
            No batches on hand.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((b, idx) => (
              <BatchRow
                key={idx}
                batch={b}
                uom={allocation.uom}
                showItem={b.itemId !== allocation.inputItemId}
                onChange={(patch) => updateRow(idx, patch)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchRow({
  batch, uom, showItem, onChange,
}: {
  batch: ProductionAllocationBatch;
  uom: string;
  /** True when this batch came from a substitute — say which, or the row lies. */
  showItem: boolean;
  onChange: (patch: Partial<LineBatchDraft>) => void;
}) {
  return (
    <div className="rounded-md px-1 py-1" style={{ background: 'var(--surface-2)' }}>
      {showItem && (
        <p className="px-1 pt-1 text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
          {batch.itemName}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
      <Input
        label="Batch"
        value={batch.batchNo ?? ''}
        onChange={(e) => onChange({ batchNo: e.target.value || null })}
      />
      <Input
        label={`Qty (${uom})`}
        type="number" min="0" step="0.001"
        value={batch.qty}
        onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
      />
      <div className="flex flex-col justify-end pb-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
        <span>{batch.expiryDate ? `Exp ${batch.expiryDate}` : 'No expiry'}</span>
        <span>{formatINR(batch.unitCost)}/{uom}</span>
      </div>
      </div>
    </div>
  );
}
