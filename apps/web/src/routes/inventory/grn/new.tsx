import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useCreateGrn, useWarehouses } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';
import { useVendors } from '@/hooks/queries/use-vendors';

interface DraftLine {
  itemId: string;
  batchNo: string;
  expiryDate: string;
  qty: number | '';
  unitRate: number | '';
}

const emptyLine = (): DraftLine => ({
  itemId: '', batchNo: '', expiryDate: '', qty: '', unitRate: '',
});

export function NewGrnPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateGrn();
  const { data: warehouses } = useWarehouses();
  const itemsRes = useItems({ status: 'active', limit: 500 });
  const { data: vendorsRes } = useVendors({ limit: 500 });

  const [warehouseId, setWarehouseId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const items = itemsRes.data?.data ?? [];
  const vendors = vendorsRes?.data ?? [];

  const itemOpts = items
    .filter((i) => i.type === 'product')
    .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }));
  const whOpts = (warehouses ?? []).map((w) => ({ value: w.id, label: w.name }));
  const vendorOpts = [
    { value: '', label: 'No vendor (direct receipt)' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  function patchLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const total = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitRate) || 0),
    0,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId) return toast('Pick a warehouse', 'error');
    const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast('Add at least one line', 'error');
    try {
      const grn = await create.mutateAsync({
        warehouseId,
        vendorId: vendorId || null,
        receivedDate,
        vehicleNo: vehicleNo || null,
        notes: notes || null,
        lines: validLines.map((l) => ({
          itemId: l.itemId,
          batchNo: l.batchNo || null,
          expiryDate: l.expiryDate || null,
          qty: Number(l.qty),
          unitRate: Number(l.unitRate),
        })),
      });
      toast(`GRN ${grn.grnNo} created as draft`, 'success');
      navigate({ to: '/inventory/grn/$id', params: { id: grn.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create GRN', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="New GRN" description="Record goods received into a warehouse." />
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Warehouse *</label>
                <Combobox value={warehouseId} onChange={setWarehouseId} options={whOpts} placeholder="Pick warehouse…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Vendor</label>
                <Combobox value={vendorId} onChange={setVendorId} options={vendorOpts} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Received date *</label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Vehicle no.</label>
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items received</h3>
              <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={14} /> Add line
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Item</Th>
                  <Th>Batch</Th>
                  <Th>Expiry</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Total</Th>
                  <Th />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const lineTotal = (Number(l.qty) || 0) * (Number(l.unitRate) || 0);
                  return (
                    <TableRow key={i}>
                      <TableCell style={{ minWidth: 220 }}>
                        <Combobox
                          value={l.itemId}
                          onChange={(v) => patchLine(i, { itemId: v })}
                          options={itemOpts}
                          placeholder="Pick item…"
                        />
                      </TableCell>
                      <TableCell><Input value={l.batchNo} onChange={(e) => patchLine(i, { batchNo: e.target.value })} /></TableCell>
                      <TableCell><Input type="date" value={l.expiryDate} onChange={(e) => patchLine(i, { expiryDate: e.target.value })} /></TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.001" min="0" className="text-right"
                          value={l.qty}
                          onChange={(e) => patchLine(i, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01" min="0" className="text-right"
                          value={l.unitRate}
                          onChange={(e) => patchLine(i, { unitRate: e.target.value === '' ? '' : Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => removeLine(i)} className="text-zinc-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end text-sm">
              <div className="font-mono tabular-nums">
                Total: <span className="font-semibold">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={create.isPending}>Save draft</Button>
          <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/grn' })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
