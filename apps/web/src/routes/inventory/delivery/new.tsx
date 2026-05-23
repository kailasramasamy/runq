import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useCreateDn, useWarehouses } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';
import { useCustomers } from '@/hooks/queries/use-customers';

interface DraftLine { itemId: string; batchNo: string; qty: number | ''; }
const emptyLine = (): DraftLine => ({ itemId: '', batchNo: '', qty: '' });

export function NewDeliveryNotePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateDn();
  const { data: warehouses } = useWarehouses();
  const itemsRes = useItems({ status: 'active', limit: 500 });
  const { data: customersRes } = useCustomers({ limit: 500 });

  const [warehouseId, setWarehouseId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('');
  const [eWayBillNo, setEWayBillNo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const items = itemsRes.data?.data ?? [];
  const customers = customersRes?.data ?? [];
  const itemOpts = items
    .filter((i) => i.type === 'product')
    .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }));
  const whOpts = (warehouses ?? []).map((w) => ({ value: w.id, label: w.name }));
  const custOpts = [
    { value: '', label: 'No customer (internal)' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  function patchLine(i: number, patch: Partial<DraftLine>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId) return toast('Pick a warehouse', 'error');
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (valid.length === 0) return toast('Add at least one line', 'error');
    try {
      const dn = await create.mutateAsync({
        warehouseId,
        customerId: customerId || null,
        dispatchDate,
        vehicleNo: vehicleNo || null,
        eWayBillNo: eWayBillNo || null,
        notes: notes || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          batchNo: l.batchNo || null,
          qty: Number(l.qty),
        })),
      });
      toast(`Delivery ${dn.dnNo} created as draft`, 'success');
      navigate({ to: '/inventory/delivery/$id', params: { id: dn.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="New delivery" description="Stock leaving a warehouse." />
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Warehouse *</label>
                <Combobox value={warehouseId} onChange={setWarehouseId} options={whOpts} placeholder="Pick warehouse…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Customer</label>
                <Combobox value={customerId} onChange={setCustomerId} options={custOpts} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Dispatch date *</label>
                <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Vehicle no.</label>
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">e-Way bill</label>
                <Input value={eWayBillNo} onChange={(e) => setEWayBillNo(e.target.value)} />
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
              <h3 className="text-sm font-semibold">Items dispatched</h3>
              <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus size={14} /> Add line
              </Button>
            </div>
            <p className="mb-2 text-xs text-zinc-500">
              Leave batch blank to let runQ FEFO-pick (first-expiry-first-out).
            </p>
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
                    <TableCell><Input value={l.batchNo} onChange={(e) => patchLine(i, { batchNo: e.target.value })} placeholder="Auto (FEFO)" /></TableCell>
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
          <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/delivery' })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
