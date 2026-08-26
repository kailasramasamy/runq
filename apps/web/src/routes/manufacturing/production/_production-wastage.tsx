/**
 * Closing-stock panel for Record Production — the floor counts what is left of
 * each input after the run, and the wastage falls out of the arithmetic:
 * wastage = (stock before − consumed) − actually left.
 *
 * Asking for the leftover instead of the loss matches what an operator can
 * actually see: 315 L went in, 600 packs came out, 10 L is still in the tank.
 * The 5 L that vanished is our sum to do, not theirs.
 *
 * Posted as a production_loss write-off linked to the run, NOT as extra
 * consumption, so the loss stays visible in the daily write-off register
 * instead of disappearing into the finished goods' unit cost.
 */
import { Trash2, Info } from 'lucide-react';
import { Card, CardHeader, CardContent, Input } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ProductionAllocation } from '@runq/types';
import { enteredQty, type DrawDraft } from './_production-lines';

export type WastageDraft = Record<string, { left: string; notes: string }>;

interface Props {
  allocations: ProductionAllocation[];
  draft: WastageDraft;
  /** What the operator typed into the draw — the qty this run really takes. */
  drawDraft: DrawDraft;
  onChange: (inputItemId: string, patch: { left?: string; notes?: string }) => void;
}

/** Unit cost to price the write-off preview — the batches this run drew from. */
function unitCostOf(a: ProductionAllocation, drawDraft: DrawDraft): number {
  const total = a.pool.reduce((s, b) => s + enteredQty(drawDraft, b) * b.unitCost, 0);
  const qty = drawnOf(a, drawDraft);
  return qty > 0 ? total / qty : 0;
}

/** What this run actually takes off stock, as typed on the draw. */
function drawnOf(a: ProductionAllocation, drawDraft: DrawDraft): number {
  return a.pool.reduce((s, b) => s + enteredQty(drawDraft, b), 0);
}

/**
 * What the books say should be left once the run draws its share.
 *
 * Measured against the typed draw, not the server's own allocation — the
 * expected balance has to describe the run being posted, or the count below
 * writes off a difference that was never a loss.
 */
export function expectedLeftOf(a: ProductionAllocation, drawDraft: DrawDraft): number {
  return a.availableQty - drawnOf(a, drawDraft);
}

/**
 * Loss implied by a counted leftover. Blank means "not counted" — silence is
 * not a claim of zero wastage. More left than expected is not wastage at all;
 * the consumed qty is wrong, so the caller is told to fix that instead.
 */
export function wastageFromLeft(
  a: ProductionAllocation,
  left: string,
  drawDraft: DrawDraft,
): number {
  if (left.trim() === '') return 0;
  const counted = Number(left);
  if (!Number.isFinite(counted)) return 0;
  return Math.max(expectedLeftOf(a, drawDraft) - counted, 0);
}

export function ProductionWastagePanel({ allocations, draft, drawDraft, onChange }: Props) {
  if (allocations.length === 0) return null;

  const totalValue = allocations.reduce(
    (sum, a) =>
      sum +
      wastageFromLeft(a, draft[a.inputItemId]?.left ?? '', drawDraft) *
        unitCostOf(a, drawDraft),
    0,
  );

  return (
    <Card>
      <CardHeader
        title="Closing stock"
        action={
          totalValue > 0 ? (
            <span className="text-[12.5px] font-semibold" style={{ color: '#dc2626' }}>
              {formatINR(totalValue)} written off
            </span>
          ) : undefined
        }
      />
      <CardContent>
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            Count what is physically left of each input after the run. Anything short of the
            expected balance is written off to Inventory Write-off and listed in the daily
            write-off register. Leave blank if you did not count.
          </p>

          {allocations.map((a) => (
            <WastageRow
              key={a.inputItemId}
              allocation={a}
              drawDraft={drawDraft}
              row={draft[a.inputItemId] ?? { left: '', notes: '' }}
              onChange={(patch) => onChange(a.inputItemId, patch)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WastageRow({
  allocation: a, drawDraft, row, onChange,
}: {
  allocation: ProductionAllocation;
  drawDraft: DrawDraft;
  row: { left: string; notes: string };
  onChange: (patch: { left?: string; notes?: string }) => void;
}) {
  const expected = expectedLeftOf(a, drawDraft);
  const counted = row.left.trim() === '' ? null : Number(row.left);
  const wasted = wastageFromLeft(a, row.left, drawDraft);
  const surplus = counted !== null && Number.isFinite(counted) && counted - expected > 0.0001;

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <Trash2 size={13} style={{ color: 'var(--text-3)' }} />
        {a.inputItemName}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          type="number" min="0" step="0.001"
          value={row.left}
          onChange={(e) => onChange({ left: e.target.value })}
          placeholder={`Left after run (${a.uom})`}
        />
        <Input
          value={row.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Reason (optional)"
          disabled={wasted <= 0}
        />
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
        Expected balance {expected.toFixed(3)} {a.uom} — {a.availableQty.toFixed(3)} in stock less{' '}
        {(a.availableQty - expected).toFixed(3)} drawn by this run.
      </p>
      {wasted > 0 && (
        <p className="mt-1 text-[11.5px] font-semibold" style={{ color: '#dc2626' }}>
          Wastage {wasted.toFixed(3)} {a.uom} — written off on top of what the run consumes.
        </p>
      )}
      {surplus && (
        <p className="mt-1 flex items-start gap-1.5 text-[11.5px]" style={{ color: '#b45309' }}>
          <Info size={13} className="mt-px shrink-0" />
          More left than expected — the run used less than the BOM says. Correct the consumed
          qty above rather than recording it here.
        </p>
      )}
    </div>
  );
}
