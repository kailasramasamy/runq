/**
 * Right panel of the WO Run view — output recording and history.
 * Spec: docs/manufacturing-plan.md §6, §9 rows 2, 3, 8.
 */
import { useState } from 'react';
import { Plus, RotateCcw, PackageCheck } from 'lucide-react';
import {
  Button, Card, CardHeader, CardContent, Input, DateInput,
  Skeleton, EmptyState, useToast,
} from '@/components/ui';
import {
  useWoOutput,
  useRecordOutput,
  useReverseOutput,
} from '@/hooks/queries/use-wo-run';
import { formatINR } from '@/lib/utils';
import type { WoOutput } from '@runq/types';

const ACCENT = '#E11D48';

interface Props {
  woId: string;
  warehouseId: string;
  outputItemId: string;
  outputUom: string;
  bomCode: string;
  status: string;
}

export function RunOutputsPanel({
  woId,
  warehouseId,
  outputItemId,
  outputUom,
  bomCode,
  status,
}: Props) {
  const canMutate = status === 'in_progress';
  const [open, setOpen] = useState(false);
  const { data: outputRes, isLoading } = useWoOutput(woId);
  const outputs = outputRes?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Outputs
      </p>

      <Card>
        <CardHeader
          title="Output batches"
          action={
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              Value set at WO close
            </span>
          }
        />
        <CardContent>
          {isLoading ? (
            <OutputSkeleton />
          ) : outputs.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No output yet"
              description="Record output batches produced during this run."
              className="py-8"
            />
          ) : (
            <div className="mb-3 space-y-1">
              {outputs.map((o) => (
                <OutputRow key={o.id} item={o} woId={woId} outputUom={outputUom} canMutate={canMutate} />
              ))}
            </div>
          )}

          {canMutate && (
            open ? (
              <OutputForm
                woId={woId}
                warehouseId={warehouseId}
                outputItemId={outputItemId}
                outputUom={outputUom}
                bomCode={bomCode}
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
                <Plus size={12} className="mr-1" /> Add output
              </Button>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Output form ──────────────────────────────────────────────────────────────

function OutputForm({
  woId,
  warehouseId,
  outputItemId,
  outputUom,
  bomCode,
  onDone,
}: {
  woId: string;
  warehouseId: string;
  outputItemId: string;
  outputUom: string;
  bomCode: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [batchNo, setBatchNo] = useState('');
  const [qty, setQty] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useRecordOutput(woId);

  const batchPlaceholder = `${bomCode}-${today}-001`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedQty = parseFloat(qty);
    if (!parsedQty || parsedQty <= 0) { toast('Qty must be positive', 'error'); return; }
    mutation.mutate(
      {
        outputItemId,
        batchNo: batchNo || null,
        warehouseId,
        qty: parsedQty,
        uom: outputUom,
        expiryDate: expiryDate || null,
        notes: notes || null,
      },
      {
        onSuccess: () => { toast('Output recorded', 'success'); onDone(); },
        onError: (e) => toast((e as Error).message || 'Failed to record output', 'error'),
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <Input
        label="Batch no (optional)"
        value={batchNo}
        onChange={(e) => setBatchNo(e.target.value)}
        placeholder={batchPlaceholder}
      />
      <Input
        label={`Qty (${outputUom})`}
        type="number"
        min="0.001"
        step="0.001"
        required
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <DateInput
        label="Expiry date"
        value={expiryDate}
        onChange={(e) => setExpiryDate(e.target.value)}
      />
      <Input
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional…"
      />
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          loading={mutation.isPending}
          style={{ background: ACCENT, borderColor: ACCENT }}
        >
          Post
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Output row ───────────────────────────────────────────────────────────────

function OutputRow({
  item,
  woId,
  outputUom,
  canMutate,
}: {
  item: WoOutput;
  woId: string;
  outputUom: string;
  canMutate: boolean;
}) {
  const { toast } = useToast();
  const reverseM = useReverseOutput(woId);

  function handleReverse() {
    reverseM.mutate(item.id, {
      onSuccess: () => toast('Output reversed', 'success'),
      onError: (e) => toast((e as Error).message || 'Failed to reverse', 'error'),
    });
  }

  return (
    <div
      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px]"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex-1 min-w-0">
        <span className="font-mono font-medium" style={{ color: 'var(--text-1)' }}>
          {item.qty.toFixed(3)} {outputUom}
        </span>
        <span className="ml-2" style={{ color: 'var(--text-3)' }}>
          Batch {item.batchNo}
        </span>
        {item.expiryDate && (
          <span className="ml-2" style={{ color: 'var(--text-3)' }}>
            exp {item.expiryDate}
          </span>
        )}
        <span className="ml-2" style={{ color: 'var(--text-3)' }}>
          {item.value > 0 ? formatINR(item.value) : '—'}
        </span>
      </div>
      {canMutate && (
        <button
          type="button"
          onClick={handleReverse}
          disabled={reverseM.isPending}
          className="shrink-0 text-red-500 hover:text-red-700 disabled:opacity-50"
          title="Reverse this output"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OutputSkeleton() {
  return (
    <div className="space-y-2 mb-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
