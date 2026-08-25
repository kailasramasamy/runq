import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, Eraser } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Select, Button, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import {
  useCreateAdjustment, useWarehouses,
  type AdjustmentReason, type PoolBucket, type ZeroOutLine,
} from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';
import { ZeroOutDialog } from './_zero-out';

interface DraftLine { itemId: string; batchNo: string; qtyDelta: number | ''; unitCost: number | ''; }
const emptyLine = (): DraftLine => ({ itemId: '', batchNo: '', qtyDelta: '', unitCost: '' });

const REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
  { value: 'damage', label: 'Damage' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'theft', label: 'Theft' },
  { value: 'found', label: 'Found' },
  { value: 'revaluation', label: 'Revaluation' },
  { value: 'correction', label: 'Correction' },
  { value: 'opening_balance', label: 'Opening balance' },
  { value: 'free_issue', label: 'Free issue (no invoice)' },
  { value: 'production_loss', label: 'Production loss (wastage)' },
];

// Reasons where the goods left without a taxable supply, so the input tax
// claimed on them has to go back — GST §17(5)(h).
const ITC_REVERSAL_REASONS: AdjustmentReason[] = ['free_issue', 'damage', 'expiry', 'theft'];

export function NewAdjustmentPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateAdjustment();
  const { data: warehouses } = useWarehouses();
  const itemsRes = useItems({ status: 'active', limit: 500 });

  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('damage');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [itcReversalValue, setItcReversalValue] = useState<number | ''>('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [postGl, setPostGl] = useState(true);
  const [zeroOutOpen, setZeroOutOpen] = useState(false);
  const showItcReversal = ITC_REVERSAL_REASONS.includes(reason);

  /**
   * Replace the draft with a zero-out group. Unit cost is left blank so the
   * ledger uses each pool's own weighted average — pinning the previewed cost
   * would go stale if anything moves before this is posted.
   */
  function loadZeroOut(zeroLines: ZeroOutLine[], gl: boolean, bucket: PoolBucket) {
    setLines(zeroLines.map((l) => ({
      itemId: l.itemId,
      batchNo: l.batchNo ?? '',
      qtyDelta: l.qtyDelta,
      unitCost: '',
    })));
    setReason('correction');
    setPostGl(gl);
    setNotes(bucket === 'uncapitalised'
      ? 'Zero out on-hand — stock never capitalised to the GL'
      : 'Zero out on-hand');
    toast(`Loaded ${zeroLines.length} lines — review before saving`, 'success');
  }

  const items = itemsRes.data?.data ?? [];
  const itemOpts = items
    .filter((i) => i.type === 'product')
    .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }));
  const whOpts = (warehouses ?? []).map((w) => ({ value: w.id, label: w.name }));

  function patchLine(i: number, patch: Partial<DraftLine>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId) return toast('Pick a warehouse', 'error');
    const valid = lines.filter((l) => l.itemId && Number(l.qtyDelta) !== 0);
    if (valid.length === 0) return toast('Add at least one line with non-zero qty', 'error');
    try {
      const a = await create.mutateAsync({
        warehouseId,
        reason,
        adjustmentDate,
        notes: notes || null,
        requiresApproval,
        itcReversalValue: showItcReversal && itcReversalValue !== ''
          ? Number(itcReversalValue)
          : undefined,
        postGl,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          batchNo: l.batchNo || null,
          qtyDelta: Number(l.qtyDelta),
          unitCost: l.unitCost === '' ? undefined : Number(l.unitCost),
        })),
      });
      toast(`Adjustment ${a.adjNo} created`, 'success');
      navigate({ to: '/inventory/adjustments/$id', params: { id: a.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="New adjustment" description="Correct on-hand stock. Positive = found, negative = removed." />
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Warehouse *</label>
                <Combobox value={warehouseId} onChange={setWarehouseId} options={whOpts} placeholder="Pick warehouse…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Reason *</label>
                <Combobox
                  value={reason}
                  onChange={(v) => setReason(v as AdjustmentReason)}
                  options={REASON_OPTIONS}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Date *</label>
                <Input type="date" value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} required />
              </div>
              <div className={showItcReversal ? 'md:col-span-2' : 'md:col-span-3'}>
                <label className="mb-1 block text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {showItcReversal && (
                <div>
                  <label className="mb-1 block text-sm font-medium">ITC to reverse</label>
                  <Input
                    type="number" step="0.01" min="0" className="text-right" placeholder="0.00"
                    value={itcReversalValue}
                    onChange={(e) => setItcReversalValue(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Input tax claimed on these goods. Recorded for your GSTR-3B Table 4(B); no journal entry is posted.
                  </p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                />
                Require approval before posting
              </label>
              <div className="md:col-span-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={postGl} onChange={(e) => setPostGl(e.target.checked)} />
                  Post a journal entry
                </label>
                {!postGl && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Stock will move without any journal entry. Only correct for stock the ledger
                    never capitalised — milk-procurement receipts, which are already expensed at
                    cycle lock. Posting a journal entry for those would expense the milk twice.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items</h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!warehouseId}
                  title={warehouseId ? undefined : 'Pick a warehouse first'}
                  onClick={() => setZeroOutOpen(true)}
                >
                  <Eraser size={14} /> Zero out on-hand
                </Button>
                <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
                  <Plus size={14} /> Add line
                </Button>
              </div>
            </div>
            <p className="mb-2 text-xs text-zinc-500">
              Qty Δ: <strong>positive</strong> = inbound (found, revaluation up); <strong>negative</strong> = outbound (damage, expiry, write-off).
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Item</Th>
                  <Th>Batch (optional)</Th>
                  <Th className="text-right">Qty Δ</Th>
                  <Th className="text-right">Unit cost (optional)</Th>
                  <Th />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell style={{ minWidth: 220 }}>
                      <Combobox value={l.itemId} onChange={(v) => patchLine(i, { itemId: v })} options={itemOpts} placeholder="Pick item…" />
                    </TableCell>
                    <TableCell><Input value={l.batchNo} onChange={(e) => patchLine(i, { batchNo: e.target.value })} /></TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.001" className="text-right"
                        value={l.qtyDelta}
                        onChange={(e) => patchLine(i, { qtyDelta: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" min="0" className="text-right" placeholder="WA cost"
                        value={l.unitCost}
                        onChange={(e) => patchLine(i, { unitCost: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => removeLine(i)} className="text-zinc-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={create.isPending}>Save draft</Button>
          <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/adjustments' })}>Cancel</Button>
        </div>
      </form>

      <ZeroOutDialog
        open={zeroOutOpen}
        onClose={() => setZeroOutOpen(false)}
        warehouseId={warehouseId}
        onLoad={loadZeroOut}
      />
    </div>
  );
}
