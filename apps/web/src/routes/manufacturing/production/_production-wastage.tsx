/**
 * Wastage panel for Record Production — input material that was drawn but
 * never made it into output (fill variation, line residue, spillage).
 *
 * Posted as a production_loss write-off linked to the run, NOT as extra
 * consumption, so the loss stays visible in the daily write-off register
 * instead of disappearing into the finished goods' unit cost.
 *
 * The BOM's scrap % is already inside `requiredQty`, so the panel states the
 * allowance per input. Anything typed here is on top of it — without that
 * line on screen it is easy to write off loss the BOM already absorbed and
 * draw the stock twice.
 */
import { Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent, Input } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { ProductionAllocation } from '@runq/types';

export type WastageDraft = Record<string, { qty: string; notes: string }>;

interface Props {
  allocations: ProductionAllocation[];
  draft: WastageDraft;
  onChange: (inputItemId: string, patch: { qty?: string; notes?: string }) => void;
}

/** Unit cost to price the write-off preview — the batches this run drew from. */
function unitCostOf(a: ProductionAllocation): number {
  const total = a.batches.reduce((s, b) => s + b.qty * b.unitCost, 0);
  const qty = a.batches.reduce((s, b) => s + b.qty, 0);
  return qty > 0 ? total / qty : 0;
}

export function ProductionWastagePanel({ allocations, draft, onChange }: Props) {
  if (allocations.length === 0) return null;

  const totalValue = allocations.reduce((sum, a) => {
    const qty = Number(draft[a.inputItemId]?.qty) || 0;
    return sum + qty * unitCostOf(a);
  }, 0);

  return (
    <Card>
      <CardHeader
        title="Wastage (optional)"
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
            Material drawn for this run that did not reach output. Written off to Inventory
            Write-off and listed in the daily write-off register.
          </p>

          {allocations.map((a) => {
            const row = draft[a.inputItemId] ?? { qty: '', notes: '' };
            const consumed = a.batches.reduce((s, b) => s + b.qty, 0);
            const wasted = Number(row.qty) || 0;
            return (
              <div key={a.inputItemId} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <Trash2 size={13} style={{ color: 'var(--text-3)' }} />
                  {a.inputItemName}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    type="number" min="0" step="0.001"
                    value={row.qty}
                    onChange={(e) => onChange(a.inputItemId, { qty: e.target.value })}
                    placeholder={`Wasted ${a.uom}`}
                  />
                  <Input
                    value={row.notes}
                    onChange={(e) => onChange(a.inputItemId, { notes: e.target.value })}
                    placeholder="Reason (optional)"
                  />
                </div>
                <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                  Run draws {consumed} {a.uom} (BOM allowance included).
                  {wasted > 0 && ` Wastage takes another ${wasted} ${a.uom} — ${consumed + wasted} ${a.uom} off stock in total.`}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
