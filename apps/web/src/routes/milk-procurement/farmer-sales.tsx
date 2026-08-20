import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Card, CardContent, CardHeader, Button, Badge, Modal, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useNodes, useFarmers, useFarmerSales, useSellableItems, useCreateFarmerSale,
  useUpdateFarmerSale, useDeleteFarmerSale, type MilkType, type MpFarmerSale,
} from '@/hooks/queries/use-milk-procurement';

const MILK_TYPES: { value: MilkType; label: string }[] = [
  { value: 'cow', label: 'Cow' }, { value: 'cow_a1', label: 'Cow A1' },
  { value: 'cow_a2', label: 'Cow A2' }, { value: 'buffalo', label: 'Buffalo' },
  { value: 'mixed', label: 'Mixed' },
];
const SHIFTS = [{ value: 'am', label: 'Morning (AM)' }, { value: 'pm', label: 'Evening (PM)' }];
const KINDS = [
  { value: 'raw_milk', label: 'Bulk milk' },
  { value: 'product', label: 'Product (ghee, curd, paneer…)' },
];
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

/** What was sold: the product's name, or the milk type for a bulk-milk line. */
function soldLabel(s: MpFarmerSale): string {
  return s.itemName ?? (s.milkType ?? 'milk').replace('_', ' ');
}

/**
 * Goods sold TO farmers — bulk milk a trader resells, or ghee/curd/paneer off
 * the counter. Both are recovered from the farmer's next payout, ahead of
 * advances; only bulk milk also draws down what the centre can dispatch.
 */
export function FarmerSalesCard() {
  const [editing, setEditing] = useState<MpFarmerSale | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [farmerId, setFarmerId] = useState('');
  const { data: farmersData } = useFarmers({ limit: 500 });
  const farmers = farmersData?.data ?? [];
  const { data, isLoading } = useFarmerSales({ farmerId: farmerId || undefined, limit: 200 });
  const sales = data?.data ?? [];
  const remove = useDeleteFarmerSale();
  const { toast } = useToast();

  const onDelete = (s: MpFarmerSale) => {
    if (!window.confirm(
      `Delete the ${s.qty} ${s.unit} sale to ${s.farmerName}? It will no longer be deducted.`)) return;
    remove.mutate(s.id, {
      onSuccess: () => toast('Sale deleted', 'success'),
      onError: (e) => toast(e instanceof Error ? e.message : 'Could not delete', 'error'),
    });
  };

  return (
    <Card>
      <CardHeader
        action={<Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Record sale</Button>}
      >
        Sold to farmers
      </CardHeader>
      <CardContent className="space-y-3">
        <Combobox label="Farmer" value={farmerId} onChange={setFarmerId} placeholder="All farmers"
          options={[{ value: '', label: 'All farmers' },
            ...farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))]} />
        <Table>
          <TableHeader><TableRow>
            <Th>Date</Th><Th>Farmer</Th><Th>Centre</Th><Th>Sold</Th>
            <Th align="right">Qty</Th><Th align="right">Rate</Th><Th align="right">Amount</Th><Th />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableSkeleton rows={4} cols={8} />
              : sales.length === 0 ? <TableEmpty colSpan={8} message="Nothing sold to farmers yet." />
                : sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {s.saleDate}{s.shift ? ` · ${s.shift.toUpperCase()}` : ''}
                    </TableCell>
                    <TableCell className="font-medium">{s.farmerName}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{s.nodeName}</TableCell>
                    <TableCell>
                      <Badge variant={s.kind === 'product' ? 'default' : 'success'}>{soldLabel(s)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(s.qty)} {s.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(Number(s.ratePerUnit))}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inr(Number(s.amount))}</TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(s)}
                          disabled={!!s.reversedAt}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(s)}
                          disabled={!!s.reversedAt}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </CardContent>
      {showAdd && <RecordSaleModal onClose={() => setShowAdd(false)} />}
      {editing && <RecordSaleModal existing={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

/** One form for both jobs — recording a sale and correcting one. */
function RecordSaleModal(
  { onClose, existing }: { onClose: () => void; existing?: MpFarmerSale },
) {
  const create = useCreateFarmerSale();
  const update = useUpdateFarmerSale();
  const { toast } = useToast();
  const { data: farmersData } = useFarmers({ limit: 500 });
  const { data: nodesData } = useNodes({ limit: 300 });
  const { data: itemsData } = useSellableItems();
  const nodes = nodesData?.data ?? [];
  const items = itemsData?.data ?? [];
  const [f, setF] = useState({
    farmerId: existing?.farmerId ?? '',
    nodeId: existing?.nodeId ?? '',
    saleDate: existing?.saleDate ?? today(),
    kind: (existing?.kind ?? 'raw_milk') as 'raw_milk' | 'product',
    shift: (existing?.shift ?? 'am') as 'am' | 'pm',
    milkType: (existing?.milkType ?? 'cow') as MilkType,
    itemId: existing?.itemId ?? '',
    qty: existing ? String(Number(existing.qty)) : '',
    ratePerUnit: existing ? String(Number(existing.ratePerUnit)) : '',
    note: existing?.note ?? '',
  });
  const isMilk = f.kind === 'raw_milk';
  // A pooled centre holds one pool, not two shifts; a product belongs to no shift.
  const node = nodes.find((n) => n.id === f.nodeId);
  const needsShift = isMilk && (node ? node.dispatchMode === 'per_shift' : true);
  const item = items.find((i) => i.id === f.itemId);
  const unit = isMilk ? 'L' : (item?.unit ?? '');
  const amount = Number(f.qty || 0) * Number(f.ratePerUnit || 0);

  // Picking a product prefills its list price — the operator can still override
  // it for a farmer who is quoted differently.
  const onItem = (itemId: string) => {
    const picked = items.find((i) => i.id === itemId);
    setF((prev) => ({
      ...prev, itemId,
      ratePerUnit: picked?.defaultSellingPrice ?? prev.ratePerUnit,
    }));
  };

  const submit = () => {
    const body = {
      farmerId: f.farmerId, nodeId: f.nodeId, saleDate: f.saleDate,
      kind: f.kind as 'raw_milk' | 'product',
      shift: needsShift ? (f.shift as 'am' | 'pm') : null,
      milkType: isMilk ? f.milkType : null,
      itemId: isMilk ? null : f.itemId,
      qty: Number(f.qty), ratePerUnit: Number(f.ratePerUnit),
      note: f.note || null,
    };
    const opts = {
      onSuccess: () => { toast(existing ? 'Sale updated' : 'Sale recorded', 'success'); onClose(); },
      onError: (e: unknown) =>
        toast(e instanceof Error ? e.message : 'Could not save the sale', 'error'),
    };
    if (existing) update.mutate({ ...body, id: existing.id }, opts);
    else create.mutate(body, opts);
  };

  const ready = f.farmerId && f.nodeId && (isMilk || f.itemId)
    && Number(f.qty) > 0 && Number(f.ratePerUnit) > 0;
  return (
    <Modal open onClose={onClose} title={existing ? 'Edit sale' : 'Record a sale to a farmer'}>
      <div className="space-y-3">
        {existing ? (
          <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
            {existing.farmerName} · {existing.nodeName}
          </div>
        ) : (
          <>
            <Combobox label="Farmer" value={f.farmerId} onChange={(v) => setF({ ...f, farmerId: v })}
              placeholder="Select farmer…"
              options={(farmersData?.data ?? []).map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} />
            <Combobox label="Centre" value={f.nodeId} onChange={(v) => setF({ ...f, nodeId: v })}
              placeholder="Where the goods were handed over…"
              options={nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} />
          </>
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input label="Date" type="date" value={f.saleDate}
              onChange={(e) => setF({ ...f, saleDate: e.target.value })} />
          </div>
          {needsShift && (
            <div className="flex-1">
              <Combobox label="Shift" value={f.shift} onChange={(v) => setF({ ...f, shift: v as 'am' | 'pm' })} options={SHIFTS} />
            </div>
          )}
        </div>
        <Combobox label="What was sold" value={f.kind}
          onChange={(v) => setF({ ...f, kind: v as 'raw_milk' | 'product' })} options={KINDS} />
        {isMilk ? (
          <Combobox label="Milk type" value={f.milkType}
            onChange={(v) => setF({ ...f, milkType: v as MilkType })} options={MILK_TYPES} />
        ) : (
          <Combobox label="Product" value={f.itemId} onChange={onItem} placeholder="Select product…"
            options={items.map((i) => ({
              value: i.id,
              label: i.sku ? `${i.name} · ${i.sku}` : i.name,
            }))} />
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input label={unit ? `Quantity (${unit})` : 'Quantity'} type="number" inputMode="decimal"
              value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </div>
          <div className="flex-1">
            <Input label={unit ? `Rate ₹/${unit}` : 'Rate ₹'} type="number" inputMode="decimal"
              value={f.ratePerUnit} onChange={(e) => setF({ ...f, ratePerUnit: e.target.value })} />
          </div>
        </div>
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
          Amount <span className="font-semibold">{inr(Math.round(amount * 100) / 100)}</span>
          <span className="text-zinc-500"> · deducted from the farmer's next payout</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!ready}>
            {existing ? 'Save' : 'Record sale'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
