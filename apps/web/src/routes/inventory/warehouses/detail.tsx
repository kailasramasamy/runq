import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog } from '@/components/ui';
import { useState } from 'react';
import { useWarehouse, useDeleteWarehouse, useOnHand } from '@/hooks/queries/use-inventory';

export function WarehouseDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: wh, isLoading } = useWarehouse(id);
  const { data: onHand } = useOnHand({ warehouseId: id });
  const del = useDeleteWarehouse();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    try {
      await del.mutateAsync(id);
      toast('Warehouse deleted', 'success');
      navigate({ to: '/inventory/warehouses' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    } finally {
      setConfirmDelete(false);
    }
  }

  if (isLoading || !wh) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  const totalQty = (onHand ?? []).reduce((s, r) => s + r.qty, 0);
  const totalValue = (onHand ?? []).reduce((s, r) => s + r.value, 0);

  return (
    <div>
      <PageHeader
        title={wh.name}
        description={`Code: ${wh.code} · ${wh.type}`}
        actions={
          <div className="flex gap-2">
            <Link to="/inventory/warehouses/$id/edit" params={{ id }}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} loading={del.isPending}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Status</h3></CardHeader>
          <CardContent>
            <Badge variant={wh.isActive ? 'success' : 'default'}>
              {wh.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {wh.isDefault && <Badge variant="primary" className="ml-2">Default</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">SKUs in stock</h3></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{(onHand ?? []).filter(r => r.qty > 0).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Stock value</h3></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Total units: {totalQty.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
      </div>

      {wh.address && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Address</h3></CardHeader>
          <CardContent><p className="text-sm">{wh.address}</p></CardContent>
        </Card>
      )}

      <ConfirmationDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete warehouse?"
        description="This is a soft delete and is blocked if the warehouse has any stock movement history."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
