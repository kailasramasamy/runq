import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PageHeader, Card, CardContent, Input, Select, Button, useToast } from '@/components/ui';
import { useCreateWarehouse } from '@/hooks/queries/use-inventory';

export function NewWarehousePage() {
  const navigate = useNavigate();
  const create = useCreateWarehouse();
  const { toast } = useToast();

  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'godown' as 'main' | 'godown' | 'shop' | 'vehicle' | 'virtual',
    address: '',
    isDefault: false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const wh = await create.mutateAsync({
        code: form.code,
        name: form.name,
        type: form.type,
        address: form.address || null,
        isDefault: form.isDefault,
      });
      toast('Warehouse created', 'success');
      navigate({ to: '/inventory/warehouses/$id', params: { id: wh.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create', 'error');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New warehouse" description="Add a location where stock is held." />
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Code</label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="MAIN, DEL-01, …"
                  autoCapitalize="characters"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                  options={[
                    { value: 'main', label: 'Main' },
                    { value: 'godown', label: 'Godown' },
                    { value: 'shop', label: 'Shop / Counter' },
                    { value: 'vehicle', label: 'Vehicle' },
                    { value: 'virtual', label: 'Virtual' },
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main godown"
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Make this the default warehouse
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="primary" loading={create.isPending}>
                Create warehouse
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate({ to: '/inventory/warehouses' })}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
