import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Download, Power, Sparkles, Trash2, Search, Calculator } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast, ConfirmationDialog,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useItems, useToggleItem, useDeleteItem,
} from '@/hooks/queries/use-items';

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useItems(search ? { search } : undefined);
  const toggle = useToggleItem();
  const remove = useDeleteItem();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const items = data?.data ?? [];
  const deletingItem = deletingId ? items.find((i) => i.id === deletingId) : null;

  const openEdit = (id: string) =>
    navigate({ to: '/masters/items/$itemId/edit', params: { itemId: id } });
  const openAnalysis = (id: string) =>
    navigate({
      to: '/masters/items/$itemId/analysis',
      params: { itemId: id },
      search: { from: 'list' },
    });

  async function handleToggle(id: string) {
    try {
      await toggle.mutateAsync(id);
      toast('Item status toggled', 'success');
    } catch {
      toast('Failed to toggle item status', 'error');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await remove.mutateAsync(deletingId);
      toast('Item deleted', 'success');
      setDeletingId(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to delete item';
      toast(msg, 'error');
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Item Master"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items' }]}
        description="Manage products and services used across invoices and bills."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV(
              'items.csv',
              [
                'Name', 'SKU', 'EAN', 'Brand', 'Product Type', 'Type', 'HSN/SAC', 'Unit', 'Grammage', 'Packing Type',
                'Selling Price', 'Purchase Price', 'MRP', 'Cost Price', 'Basic Price', 'GST%', 'GST Value', 'Margin %',
                'Vendor Pack Size', 'Packaging Dimension', 'Shelf Life Days', 'RTV', 'Temperature', 'Cut-off Time',
                'Category', 'Subcategory', 'Description', 'Status',
              ],
              items.map((i) => [
                i.name, i.sku ?? '', i.ean ?? '', i.brand ?? '', i.productType ?? '', i.type, i.hsnSacCode ?? '',
                i.unit ?? '', i.grammage ?? '', i.packingType ?? '',
                String(i.defaultSellingPrice ?? ''), String(i.defaultPurchasePrice ?? ''), String(i.mrp ?? ''),
                String(i.costPrice ?? ''), String(i.basicPrice ?? ''), String(i.gstRate ?? ''),
                String(i.gstValue ?? ''), String(i.margin ?? ''),
                i.vendorPackSize ?? '', i.packagingDimension ?? '', String(i.shelfLifeDays ?? ''),
                i.rtvAllowed == null ? '' : i.rtvAllowed ? 'RTV' : 'Non RTV',
                i.temperature ?? '', i.cutoffTime ?? '',
                i.category ?? '', i.subcategory ?? '', i.description ?? '',
                i.isActive ? 'Active' : 'Inactive',
              ]),
            )}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: '/masters/items/import' })}>
              <Sparkles size={14} /> Smart Import
            </Button>
            <Button size="sm" onClick={() => navigate({ to: '/masters/items/new' })}>
              <Plus size={14} /> New Item
            </Button>
          </div>
        }
      />

      {/* Delete confirmation */}
      <ConfirmationDialog
        open={!!deletingItem}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete item?"
        description={
          deletingItem
            ? `"${deletingItem.name}" will be permanently deleted. This cannot be undone. If the item is referenced by a price list, deletion will be blocked.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />

      {/* Search */}
      <div className="mb-4">
        <div className="relative sm:w-80">
          <Input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute mt-[-30px] ml-3 text-zinc-400" />
        </div>
      </div>

      {/* Mobile cards */}
      {isLoading ? (
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 md:hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => openEdit(item.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{item.name}</p>
                  {item.sku && <p className="font-mono text-xs text-zinc-400">{item.sku}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Badge variant={item.type === 'product' ? 'info' : 'primary'}>{item.type}</Badge>
                  <Badge variant={statusVariant(item.isActive)}>{item.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : '—'}</span>
                {item.gstRate != null && <span>GST {item.gstRate}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>SKU</Th>
                <Th>EAN</Th>
                <Th>Brand</Th>
                <Th>Type</Th>
                <Th>HSN/SAC</Th>
                <Th>Unit</Th>
                <Th align="right">Selling Price</Th>
                <Th align="right">MRP</Th>
                <Th align="right">GST%</Th>
                <Th align="right">Margin%</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={14} />
              ) : items.length === 0 ? (
                <TableEmpty
                  colSpan={14}
                  message={search ? `No items match "${search}".` : "No items yet. Click 'New Item' to get started."}
                />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => openEdit(item.id)}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{item.ean ?? '-'}</TableCell>
                    <TableCell className="text-zinc-500">{item.brand ?? '-'}</TableCell>
                    <TableCell><Badge variant={item.type === 'product' ? 'info' : 'primary'}>{item.type}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{item.hsnSacCode ?? '-'}</TableCell>
                    <TableCell>{item.unit ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.mrp != null ? formatINR(item.mrp) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.gstRate != null ? `${item.gstRate}%` : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.margin != null ? `${item.margin}%` : '-'}</TableCell>
                    <TableCell className="text-zinc-500">{item.category ?? '-'}{item.subcategory ? ` / ${item.subcategory}` : ''}</TableCell>
                    <TableCell><Badge variant={statusVariant(item.isActive)}>{item.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell align="right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAnalysis(item.id)}
                          aria-label={`Analyse ${item.name}`}
                          title="Cost & profit analysis"
                        >
                          <Calculator size={14} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggle(item.id)} disabled={toggle.isPending}>
                          <Power size={14} /> {item.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeletingId(item.id)}
                          aria-label={`Delete ${item.name}`}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
