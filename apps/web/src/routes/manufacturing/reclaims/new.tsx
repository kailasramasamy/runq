import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useCreateReclaim } from '@/hooks/queries/use-reclaims';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';

interface DraftLine {
  fgItemId: string;
  fgBatchNo: string;
  fgQty: number | '';
  recoveredItemId: string;
  recoveredBatchNo: string;
  recoveredQty: number | '';
  expiryDate: string;
}

const emptyLine = (): DraftLine => ({
  fgItemId: '', fgBatchNo: '', fgQty: '',
  recoveredItemId: '', recoveredBatchNo: '', recoveredQty: '', expiryDate: '',
});

export function NewReclaimPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateReclaim();
  const { data: warehouses } = useWarehouses();
  const itemsRes = useItems({ status: 'active', limit: 500 });

  const [warehouseId, setWarehouseId] = useState('');
  const [reclaimDate, setReclaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

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
    const valid = lines.filter(
      (l) => l.fgItemId && l.recoveredItemId && Number(l.fgQty) > 0 && Number(l.recoveredQty) > 0,
    );
    if (valid.length === 0) return toast('Add at least one complete line', 'error');
    if (valid.some((l) => l.fgItemId === l.recoveredItemId)) {
      return toast('The recovered material must differ from the product being opened', 'error');
    }
    try {
      const r = await create.mutateAsync({
        warehouseId,
        reclaimDate,
        notes: notes || null,
        lines: valid.map((l) => ({
          fgItemId: l.fgItemId,
          fgBatchNo: l.fgBatchNo || null,
          fgQty: Number(l.fgQty),
          recoveredItemId: l.recoveredItemId,
          recoveredBatchNo: l.recoveredBatchNo || null,
          recoveredQty: Number(l.recoveredQty),
          expiryDate: l.expiryDate || null,
        })),
      });
      toast(`Reclaim ${r.reclaimNo} created`, 'success');
      navigate({ to: '/manufacturing/reclaims/$id', params: { id: r.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="New reclaim"
        description="Open unsold finished goods and return the material to the raw-material pool."
      />
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Warehouse *</label>
                <Combobox value={warehouseId} onChange={setWarehouseId} options={whOpts} placeholder="Pick warehouse…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Date *</label>
                <Input type="date" value={reclaimDate} onChange={(e) => setReclaimDate(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Lines</h3>
              <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={14} /> Add line
              </Button>
            </div>
            <p className="mb-2 text-xs text-zinc-500">
              Recovered material enters at raw-material cost — the packaging and processing already spent
              on the finished goods is written off. Give reclaimed batches a short expiry so they get used first.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Finished good</Th>
                  <Th>FG batch</Th>
                  <Th className="text-right">FG qty</Th>
                  <Th>Recovered as</Th>
                  <Th>New batch</Th>
                  <Th className="text-right">Recovered qty</Th>
                  <Th>Expiry</Th>
                  <Th />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell style={{ minWidth: 200 }}>
                      <Combobox value={l.fgItemId} onChange={(v) => patchLine(i, { fgItemId: v })} options={itemOpts} placeholder="Pick product…" />
                    </TableCell>
                    <TableCell>
                      <Input value={l.fgBatchNo} onChange={(e) => patchLine(i, { fgBatchNo: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.001" min="0" className="text-right"
                        value={l.fgQty}
                        onChange={(e) => patchLine(i, { fgQty: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell style={{ minWidth: 200 }}>
                      <Combobox value={l.recoveredItemId} onChange={(v) => patchLine(i, { recoveredItemId: v })} options={itemOpts} placeholder="Pick material…" />
                    </TableCell>
                    <TableCell>
                      <Input value={l.recoveredBatchNo} onChange={(e) => patchLine(i, { recoveredBatchNo: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.001" min="0" className="text-right"
                        value={l.recoveredQty}
                        onChange={(e) => patchLine(i, { recoveredQty: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={l.expiryDate} onChange={(e) => patchLine(i, { expiryDate: e.target.value })} />
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
          <Button type="button" variant="secondary" onClick={() => navigate({ to: '/manufacturing/reclaims' })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
