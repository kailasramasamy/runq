/**
 * Left panel of the WO Run view — BOM input lines with FEFO-suggested batches
 * and per-line consumption entry / history.
 * Spec: docs/manufacturing-plan.md §6, §9.
 */
import { useEffect, useState } from 'react';
import { Plus, RotateCcw, FlaskConical } from 'lucide-react';
import {
  Button, Card, CardHeader, CardContent, Combobox,
  Input, Skeleton, EmptyState, useToast,
} from '@/components/ui';
import {
  useWoConsumption,
  useRecordConsumption,
  useReverseConsumption,
  useSuggestedBatches,
} from '@/hooks/queries/use-wo-run';
import { useItems } from '@/hooks/queries/use-items';
import { formatItemQty, formatINR } from '@/lib/utils';
import type { WorkOrderExpectedLine, WoConsumption } from '@runq/types';

const ACCENT = '#E11D48';

interface Props {
  woId: string;
  warehouseId: string;
  expected: WorkOrderExpectedLine[];
  status: string;
}

export function RunInputsPanel({ woId, warehouseId, expected, status }: Props) {
  const canMutate = status === 'in_progress';
  const { data: consumptionRes, isLoading } = useWoConsumption(woId);
  const consumptions = consumptionRes?.data ?? [];

  // Group consumptions by bomLineId (null = ad-hoc)
  const byLine = new Map<string | null, WoConsumption[]>();
  for (const c of consumptions) {
    const key = c.bomLineId ?? null;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key)!.push(c);
  }

  const adhoc = byLine.get(null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Inputs (consumption)
      </p>

      {expected.length === 0 && (
        <EmptyState
          icon={FlaskConical}
          title="No BOM input lines"
          description="This BOM has no input lines. Use ad-hoc consumption below."
        />
      )}

      {expected.map((line) => (
        <BomLineCard
          key={line.bomLineId}
          woId={woId}
          warehouseId={warehouseId}
          line={line}
          consumptions={byLine.get(line.bomLineId) ?? []}
          isLoading={isLoading}
          canMutate={canMutate}
        />
      ))}

      {/* Ad-hoc consumption card */}
      <AdhocConsumptionCard
        woId={woId}
        warehouseId={warehouseId}
        consumptions={adhoc}
        isLoading={isLoading}
        canMutate={canMutate}
      />
    </div>
  );
}

// ─── BOM line card ────────────────────────────────────────────────────────────

function BomLineCard({
  woId,
  warehouseId,
  line,
  consumptions,
  isLoading,
  canMutate,
}: {
  woId: string;
  warehouseId: string;
  line: WorkOrderExpectedLine;
  consumptions: WoConsumption[];
  isLoading: boolean;
  canMutate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const actualConsumed = consumptions.reduce((s, c) => s + c.qty, 0);
  const actualValue = consumptions.reduce((s, c) => s + c.value, 0);

  const pct = line.expectedQty > 0 ? Math.min(actualConsumed / line.expectedQty, 1) : 0;
  const over = actualConsumed > line.expectedQty;
  const excessQty = over ? actualConsumed - line.expectedQty : 0;
  const avgUnitCost = actualConsumed > 0 ? actualValue / actualConsumed : 0;
  const excessValue = excessQty * avgUnitCost;

  return (
    <Card>
      <CardHeader
        title={line.inputItemName}
        action={
          line.isOptional ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Optional
            </span>
          ) : null
        }
      />
      <CardContent>
        {/* Progress bar */}
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
            <span>Expected: {formatItemQty(line.expectedQty, null, line.inputUom)} {line.inputUom}</span>
            <span style={{ color: over ? '#d97706' : 'var(--text-3)' }}>
              Consumed: {formatItemQty(actualConsumed, null, line.inputUom)} {line.inputUom}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct * 100}%`,
                background: over ? '#d97706' : ACCENT,
              }}
            />
          </div>
          {line.scrapPct > 0 && (
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
              Includes {line.scrapPct}% scrap
            </p>
          )}

          {over && (
            <div
              className="mt-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]"
              style={{
                background: 'rgba(217, 119, 6, 0.08)',
                borderColor: 'rgba(217, 119, 6, 0.35)',
                color: '#b45309',
              }}
            >
              <span className="font-medium">Excess vs. expected</span>
              <span className="flex items-center gap-2 font-mono">
                <span>+{formatItemQty(excessQty, null, line.inputUom)} {line.inputUom}</span>
                <span style={{ color: 'rgba(180, 83, 9, 0.55)' }}>·</span>
                <span>{formatINR(excessValue)} loss</span>
              </span>
            </div>
          )}
        </div>

        {/* Past consumptions */}
        {isLoading ? (
          <ConsumptionSkeleton />
        ) : consumptions.length === 0 ? (
          <p className="text-center py-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
            No consumption yet
          </p>
        ) : (
          <div className="mb-3 space-y-1">
            {consumptions.map((c) => (
              <ConsumptionRow key={c.id} item={c} woId={woId} canMutate={canMutate} />
            ))}
          </div>
        )}

        {/* Add consumption form */}
        {canMutate && (
          open ? (
            <ConsumeForm
              woId={woId}
              warehouseId={warehouseId}
              bomLineId={line.bomLineId}
              inputItemId={line.inputItemId}
              inputUom={line.inputUom}
              // Pre-fill the remaining-to-consume so the operator usually
              // just clicks Post. Negative is clamped (over-consumed).
              defaultQty={Math.max(line.expectedQty - actualConsumed, 0)}
              onDone={() => setOpen(false)}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              style={{ borderColor: ACCENT, color: ACCENT }}
            >
              <Plus size={12} className="mr-1" /> Add consumption
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ad-hoc consumption card ──────────────────────────────────────────────────

function AdhocConsumptionCard({
  woId,
  warehouseId,
  consumptions,
  isLoading,
  canMutate,
}: {
  woId: string;
  warehouseId: string;
  consumptions: WoConsumption[];
  isLoading: boolean;
  canMutate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adhocItemId, setAdhocItemId] = useState('');
  const { data: itemsRes } = useItems({ itemClassGroup: 'inputs', limit: 200 });
  const itemOptions = (itemsRes?.data ?? []).map((i) => ({ value: i.id, label: i.name }));
  const selectedItem = (itemsRes?.data ?? []).find((i) => i.id === adhocItemId);

  return (
    <Card>
      <CardHeader
        title="Ad-hoc consumption"
        action={
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            Items not in BOM
          </span>
        }
      />
      <CardContent>
        {isLoading ? (
          <ConsumptionSkeleton />
        ) : consumptions.length === 0 ? (
          <p className="text-center py-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
            No ad-hoc consumption yet
          </p>
        ) : (
          <div className="mb-3 space-y-1">
            {consumptions.map((c) => (
              <ConsumptionRow key={c.id} item={c} woId={woId} canMutate={canMutate} />
            ))}
          </div>
        )}

        {canMutate && !open && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            <Plus size={12} className="mr-1" /> Add ad-hoc item
          </Button>
        )}

        {canMutate && open && (
          <div className="space-y-3">
            <Combobox
              label="Input item"
              required
              options={itemOptions}
              value={adhocItemId}
              onChange={setAdhocItemId}
              placeholder="Search items…"
            />
            {adhocItemId && selectedItem && (
              <ConsumeForm
                woId={woId}
                warehouseId={warehouseId}
                bomLineId={null}
                inputItemId={adhocItemId}
                inputUom={selectedItem.unit ?? 'pcs'}
                onDone={() => { setOpen(false); setAdhocItemId(''); }}
              />
            )}
            {!adhocItemId && (
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Consume form (inline, appears per BOM line or ad-hoc) ───────────────────

function ConsumeForm({
  woId,
  warehouseId,
  bomLineId,
  inputItemId,
  inputUom,
  defaultQty,
  onDone,
}: {
  woId: string;
  warehouseId: string;
  bomLineId: string | null;
  inputItemId: string;
  inputUom: string;
  defaultQty?: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [batchNo, setBatchNo] = useState('');
  // Pre-fill from BOM expected − already-consumed. 0 → blank so the operator
  // sees the empty placeholder instead of a confusing "0".
  const [qty, setQty] = useState(defaultQty && defaultQty > 0 ? String(defaultQty) : '');
  const [notes, setNotes] = useState('');

  const { data: batchRes } = useSuggestedBatches({ woId, inputItemId, warehouseId });
  const batches = batchRes?.data ?? [];
  const batchOptions = batches.map((b) => ({
    value: b.batchNo,
    label: `${b.batchNo} — ${formatItemQty(b.availableQty, null, inputUom)} ${inputUom} avail${b.expiryDate ? `, exp ${b.expiryDate}` : ''}`,
  }));

  // FEFO suggestion: pre-select the first batch (API returns FEFO-sorted)
  // so the common case is a single click. Operator can override via the
  // dropdown. Only fires the first time batches arrive — once the operator
  // has touched batchNo we leave it alone.
  useEffect(() => {
    if (!batchNo && batches.length > 0) setBatchNo(batches[0]!.batchNo);
    // batches identity is stable per react-query response; depending on
    // length is enough to fire once when data lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches.length]);

  const mutation = useRecordConsumption(woId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedQty = parseFloat(qty);
    if (!parsedQty || parsedQty <= 0) { toast('Qty must be positive', 'error'); return; }
    mutation.mutate(
      {
        bomLineId: bomLineId ?? undefined,
        inputItemId,
        batchNo: batchNo || null,
        warehouseId,
        qty: parsedQty,
        uom: inputUom,
        notes: notes || null,
      },
      {
        onSuccess: () => { toast('Consumption recorded', 'success'); onDone(); },
        onError: (e) => toast((e as Error).message || 'Failed to record', 'error'),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      {batchOptions.length > 0 ? (
        <Combobox
          label={`Batch (FEFO suggested — ${inputUom})`}
          options={batchOptions}
          value={batchNo}
          onChange={setBatchNo}
          placeholder="Select batch…"
        />
      ) : (
        <Input
          label="Batch no"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
          placeholder="Batch no (optional)"
        />
      )}
      <Input
        label={`Qty (${inputUom})`}
        type="number"
        min="0.001"
        step="0.001"
        required
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <Input
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional…"
      />
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={mutation.isPending} style={{ background: ACCENT, borderColor: ACCENT }}>
          Post
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Shared consumption row ───────────────────────────────────────────────────

function ConsumptionRow({
  item,
  woId,
  canMutate,
}: {
  item: WoConsumption;
  woId: string;
  canMutate: boolean;
}) {
  const { toast } = useToast();
  const reverseM = useReverseConsumption(woId);

  function handleReverse() {
    reverseM.mutate(item.id, {
      onSuccess: () => toast('Consumption reversed', 'success'),
      onError: (e) => toast((e as Error).message || 'Failed to reverse', 'error'),
    });
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md px-2.5 py-2"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[12px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
          {formatItemQty(item.qty, null, item.uom)} <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>{item.uom}</span>
        </div>
        {item.batchNo && (
          <div className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--text-3)' }}>
            Batch {item.batchNo}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--text-1)' }}>
          {formatINR(item.value)}
        </div>
        {item.unitCost > 0 && (
          <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
            @ {formatINR(item.unitCost)}/{item.uom}
          </div>
        )}
      </div>
      {canMutate && (
        <button
          type="button"
          onClick={handleReverse}
          disabled={reverseM.isPending}
          className="shrink-0 text-red-500 hover:text-red-700 disabled:opacity-50"
          title="Reverse this consumption"
        >
          <RotateCcw size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ConsumptionSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
