import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, Input, Combobox, Button, useToast,
} from '@/components/ui';
import { useWarehouse, useUpdateWarehouse } from '@/hooks/queries/use-inventory';

type WhType = 'main' | 'godown' | 'shop' | 'vehicle' | 'virtual';

const TYPE_OPTIONS = [
  { value: 'main', label: 'Main' },
  { value: 'godown', label: 'Godown' },
  { value: 'shop', label: 'Shop / Counter' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'virtual', label: 'Virtual' },
];

export function EditWarehousePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { data: wh, isLoading } = useWarehouse(id);
  const update = useUpdateWarehouse();
  const { toast } = useToast();

  const [form, setForm] = useState({
    code: '', name: '', type: 'godown' as WhType,
    address: '', isDefault: false, isActive: true,
  });

  useEffect(() => {
    if (!wh) return;
    setForm({
      code: wh.code,
      name: wh.name,
      type: wh.type as WhType,
      address: wh.address ?? '',
      isDefault: wh.isDefault,
      isActive: wh.isActive,
    });
  }, [wh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id,
        name: form.name,
        type: form.type,
        address: form.address || null,
        isDefault: form.isDefault,
        isActive: form.isActive,
      });
      toast('Warehouse updated', 'success');
      navigate({ to: '/inventory/warehouses/$id', params: { id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error');
    }
  }

  if (isLoading || !wh) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit ${wh.name}`} description={`Code: ${wh.code} — code can't be changed.`} />
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Code</label>
                <Input value={form.code} disabled />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <Combobox
                  options={TYPE_OPTIONS}
                  value={form.type}
                  onChange={(v) => setForm({ ...form, type: (v || 'godown') as WhType })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street, city, PIN (optional)"
              />
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                />
                Default warehouse
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="primary" loading={update.isPending}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate({ to: '/inventory/warehouses/$id', params: { id } })}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
