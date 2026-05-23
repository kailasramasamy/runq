import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useCreateTransfer, useWarehouses } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';

interface DraftLine { itemId: string; batchNo: string; qty: number | ''; }
const emptyLine = (): DraftLine => ({ itemId: '', batchNo: '', qty: '' });

export function NewTransferPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateTransfer();
  const { data: warehouses } = useWarehouses();
  const itemsRes = useItems({ status: 'active', limit: 500 });

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
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
    if (!fromId || !toId) return toast('Pick both warehouses', 'error');
    if (fromId === toId) return toast('From and To must differ', 'error');
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (valid.length === 0) return toast('Add at least one line', 'error');
    try {
      const t = await create.mutateAsync({
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        vehicleNo: vehicleNo || null,
        notes: notes || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          batchNo: l.batchNo || null,
          qty: Number(l.qty),
        })),
      });
      toast(`Transfer ${t.transferNo} created`, 'success');
      navigate({ to: '/inventory/transfers/$id', params: { id: t.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="New transfer" description="Move stock between two warehouses." />
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">From warehouse *</label>
                <Combobox value={fromId} onChange={setFromId} options={whOpts} placeholder="Source…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">To warehouse *</label>
                <Combobox value={toId} onChange={setToId} options={whOpts} placeholder="Destination…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Vehicle no.</label>
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items to transfer</h3>
              <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={14} /> Add line
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Item</Th>
                  <Th>Batch (optional)</Th>
                  <Th className="text-right">Qty</Th>
                  <Th />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell style={{ minWidth: 260 }}>
                      <Combobox
                        value={l.itemId}
                        onChange={(v) => patchLine(i, { itemId: v })}
                        options={itemOpts}
                        placeholder="Pick item…"
                      />
                    </TableCell>
                    <TableCell><Input value={l.batchNo} onChange={(e) => patchLine(i, { batchNo: e.target.value })} /></TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.001" min="0" className="text-right"
                        value={l.qty}
                        onChange={(e) => patchLine(i, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
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
          <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/transfers' })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
