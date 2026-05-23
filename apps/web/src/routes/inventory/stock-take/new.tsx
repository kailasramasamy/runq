import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, Input, Combobox, Select, Button, useToast,
} from '@/components/ui';
import { useStartStockTake, useWarehouses } from '@/hooks/queries/use-inventory';

export function NewStockTakePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const start = useStartStockTake();
  const { data: warehouses } = useWarehouses();

  const [warehouseId, setWarehouseId] = useState('');
  const [scope, setScope] = useState<'full' | 'partial' | 'cycle'>('full');
  const [notes, setNotes] = useState('');
  const [freeze, setFreeze] = useState(false);

  const whOpts = (warehouses ?? []).map((w) => ({ value: w.id, label: w.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId) return toast('Pick a warehouse', 'error');
    try {
      const st = await start.mutateAsync({
        warehouseId, scope, notes: notes || null, freeze,
      });
      toast(`${st.stNo} started — snapshot taken`, 'success');
      navigate({ to: '/inventory/stock-take/$id', params: { id: st.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Start stock take" description="Snapshot the warehouse for counting." />
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Warehouse *</label>
              <Combobox value={warehouseId} onChange={setWarehouseId} options={whOpts} placeholder="Pick warehouse…" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Scope</label>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                options={[
                  { value: 'full', label: 'Full — every SKU in the warehouse' },
                  { value: 'partial', label: 'Partial — selected category (Phase 3)' },
                  { value: 'cycle', label: 'Cycle — rotating subset' },
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. month-end count" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
              Freeze the warehouse — blocks GRN/DN/transfer/adjustment until this session ends
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="primary" loading={start.isPending}>Start session</Button>
              <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/stock-take' })}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
