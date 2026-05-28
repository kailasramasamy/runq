import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  PageHeader, Button, Card, CardHeader, CardContent,
  Input, DateInput, Textarea, Combobox, useToast,
} from '@/components/ui';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import { useItems } from '@/hooks/queries/use-items';
import { useCreateDirectReceipt } from '@/hooks/queries/use-direct-receipts';

export function NewDirectReceiptPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const { data: warehouses = [] } = useWarehouses();
  // Direct receipt is for inputs (raw materials, packaging) — milk procurement,
  // opening stock, production returns. Filter to those classes so the picker
  // doesn't drown in finished goods the user can't actually receive this way.
  const { data: itemsRes } = useItems({ limit: 200, itemClassGroup: 'inputs' });

  const warehouseOptions = [
    { value: '', label: 'Select warehouse…' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];
  const activeInputItems = itemsRes?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = [
    { value: '', label: 'Select item…' },
    ...activeInputItems.map((i) => ({
      value: i.id,
      label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    })),
  ];
  const noInputItems = activeInputItems.length === 0;

  const [warehouseId, setWarehouseId] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [receivedAt, setReceivedAt] = useState(today);
  const [qty, setQty] = useState('');
  const [unitRate, setUnitRate] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useCreateDirectReceipt();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId || !inventoryItemId) {
      toast('Pick warehouse and item', 'error');
      return;
    }
    const q = parseFloat(qty);
    const r = parseFloat(unitRate);
    if (!(q > 0) || !(r >= 0)) {
      toast('Qty > 0 and rate ≥ 0', 'error');
      return;
    }
    mutation.mutate(
      {
        warehouseId,
        inventoryItemId,
        receivedAt,
        qty: q,
        unitRate: r,
        sourceLabel: sourceLabel || null,
        batchNo: batchNo || null,
        expiryDate: expiryDate || null,
        vehicleNo: vehicleNo || null,
        lrNo: lrNo || null,
        notes: notes || null,
      },
      {
        onSuccess: (res) => {
          const r = (res as { data?: { grnNo?: string } })?.data;
          toast(`Receipt ${r?.grnNo ?? ''} posted`, 'success');
          navigate({ to: '/purchase/direct' });
        },
        onError: (err) => toast((err as Error).message || 'Failed to post', 'error'),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="New direct receipt"
        description="Memo qty entry. Posts a stock-in movement only — no JE, no bill."
        breadcrumbs={[
          { label: 'Purchase', href: '/purchase' },
          { label: 'Direct Receipts', href: '/purchase/direct' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-3xl">
        {noInputItems && (
          <Card>
            <CardContent>
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-[12.5px] dark:border-amber-800/60 dark:bg-amber-950/30">
                <div style={{ color: 'var(--text-2)' }}>
                  No raw-material or packaging items exist yet. Direct receipt only lists items
                  classed as inputs (raw materials, packaging). Create the items you procure —
                  e.g. <em>A1 Milk</em>, <em>A2 Milk</em>, <em>Buffalo Milk</em> — from{' '}
                  <a href="/purchase/items/new" className="font-medium underline">
                    Purchase → Items → New
                  </a>{' '}
                  and set the class to "Raw material" before returning here.
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader title="What and how much" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Combobox
                label="Item" required
                options={itemOptions}
                value={inventoryItemId}
                onChange={setInventoryItemId}
                placeholder={noInputItems ? 'No input items — create one first' : 'Search item…'}
                disabled={noInputItems}
              />
              <Combobox
                label="Warehouse" required
                options={warehouseOptions}
                value={warehouseId}
                onChange={setWarehouseId}
                placeholder="Pick warehouse…"
              />
              <Input
                label="Qty" required
                type="number" min="0" step="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <Input
                label="Unit rate (₹)" required
                type="number" min="0" step="0.01"
                value={unitRate}
                onChange={(e) => setUnitRate(e.target.value)}
              />
              <DateInput
                label="Received on" required
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
              <Input
                label="Source label"
                placeholder="Farmer name / Plant A morning shift…"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Optional batch + transport" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Batch"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="Required if item is batch-tracked"
              />
              <DateInput
                label="Expiry"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
              <Input
                label="Vehicle no"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
              />
              <Input
                label="LR / docket no"
                value={lrNo}
                onChange={(e) => setLrNo(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <Textarea
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: '/purchase/direct' })}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Post receipt
          </Button>
        </div>
      </form>
    </div>
  );
}
