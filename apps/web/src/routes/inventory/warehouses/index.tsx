import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Warehouse, CheckCircle2, Boxes, Store, Search, Trash2, Pencil } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  Badge, TableSkeleton, EmptyState, Combobox, ConfirmationDialog, useToast,
} from '@/components/ui';
import { useWarehouses, useWarehouseBreakdown, useDeleteWarehouse } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

type DeleteTarget = { id: string; name: string };

const TYPE_LABELS: Record<string, string> = {
  main: 'Main', godown: 'Godown', shop: 'Shop', vehicle: 'Vehicle', virtual: 'Virtual',
};

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'main', label: 'Main' },
  { value: 'godown', label: 'Godown' },
  { value: 'shop', label: 'Shop' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'virtual', label: 'Virtual' },
];

type Params = { q?: string; type?: string };

export function WarehouseListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const search = params.q ?? '';
  const typeFilter = params.type ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/warehouses',
      search: (prev: Params) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    } as never);
  }

  const { data, isLoading } = useWarehouses();
  const { data: breakdown } = useWarehouseBreakdown();
  const del = useDeleteWarehouse();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete.id);
      toast(`Deleted ${pendingDelete.name}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    } finally {
      setPendingDelete(null);
    }
  }

  const filtered = (data ?? []).filter((w) => {
    const q = search.toLowerCase();
    const matchesQ = !q || w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q) || w.type.toLowerCase().includes(q);
    const matchesType = !typeFilter || w.type === typeFilter;
    return matchesQ && matchesType;
  });

  const activeCount = (data ?? []).filter((w) => w.isActive).length;
  const totalValue = (breakdown ?? []).reduce((s, w) => s + w.totalValue, 0);
  const shopCount = (data ?? []).filter((w) => w.type === 'shop').length;
  const hasFilters = !!search || !!typeFilter;

  return (
    <div>
      <PageHeader
        title="Warehouses"
        description="Where your stock physically lives."
        actions={
          <Link to="/inventory/warehouses/new">
            <Button variant="primary"><Plus size={16} /> New warehouse</Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'Total locations', value: data?.length ?? 0, icon: Warehouse, loading: isLoading },
        { label: 'Active', value: activeCount, icon: CheckCircle2, tone: 'success', loading: isLoading },
        { label: 'Stock value', value: formatInrShort(totalValue), icon: Boxes, loading: !breakdown },
        { label: 'Shop counters', value: shopCount, icon: Store, loading: isLoading },
      ]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search warehouses (name, code, type)…"
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
          />
        </div>
        <Combobox
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => updateSearch({ type: v || undefined })}
          placeholder="All types"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{filtered.length} warehouses</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title={hasFilters ? 'No warehouses match your filters' : 'No warehouses yet'}
          description={hasFilters ? 'Try adjusting your search or type filter.' : 'Add your first warehouse to start tracking stock movements.'}
          action={!hasFilters && (
            <Link to="/inventory/warehouses/new">
              <Button variant="primary"><Plus size={16} /> Add warehouse</Button>
            </Link>
          )}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Default</Th>
              <Th>Status</Th>
              <Th className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono">{w.code}</TableCell>
                <TableCell>
                  <Link
                    to="/inventory/warehouses/$id"
                    params={{ id: w.id }}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {w.name}
                  </Link>
                </TableCell>
                <TableCell>{TYPE_LABELS[w.type] ?? w.type}</TableCell>
                <TableCell>{w.isDefault ? <Badge>Default</Badge> : '—'}</TableCell>
                <TableCell>
                  <Badge variant={w.isActive ? 'success' : 'default'}>
                    {w.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      to="/inventory/warehouses/$id/edit"
                      params={{ id: w.id }}
                      aria-label={`Edit ${w.name}`}
                      title="Edit warehouse"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <Pencil size={14} />
                    </Link>
                    <button
                      type="button"
                      aria-label={`Delete ${w.name}`}
                      disabled={w.isDefault}
                      title={w.isDefault ? 'Default warehouse cannot be deleted' : 'Delete warehouse'}
                      onClick={() => setPendingDelete({ id: w.id, name: w.name })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-red-950/40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmationDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete warehouse?'}
        description="Soft delete — blocked if the warehouse has any stock movement history."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
