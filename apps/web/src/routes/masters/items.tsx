import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Download, Power, Sparkles, Trash2, Search, Calculator, Copy, TrendingUp } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast, ConfirmationDialog, Pagination,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { Item } from '@/hooks/queries/use-items';
import type { ItemAttributeField } from '@runq/types';
import {
  useItems, useToggleItem, useDeleteItem, useItemAttributeSchema,
} from '@/hooks/queries/use-items';

const LIMIT = 20;

/**
 * Render an attribute value from items.attributes in a way that's safe for
 * a table cell — coerces booleans to Yes/No, numbers to their string form,
 * objects/arrays to JSON, and null/undefined to an em-dash.
 */
function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
}

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useItems({
    page,
    limit: LIMIT,
    ...(search ? { search } : {}),
  });
  const { data: schemaRes } = useItemAttributeSchema();
  const toggle = useToggleItem();
  const remove = useDeleteItem();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const items = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;
  const deletingItem = deletingId ? items.find((i) => i.id === deletingId) : null;

  // Pick up to 2 short-form schema fields for the desktop table — textarea
  // fields are too long, so skip them. The rest of the schema still shows
  // up in the CSV export so power users can get every attribute.
  const schema: ItemAttributeField[] = schemaRes?.data ?? [];
  const tableAttributeFields = useMemo(
    () => schema.filter((f) => f.type !== 'textarea').slice(0, 2),
    [schema],
  );

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
            <Button variant="outline" size="sm" onClick={() => exportItemsCsv(items, schema)}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: '/masters/items/profitability' })}>
              <TrendingUp size={14} /> Profitability
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
                {tableAttributeFields.map((f) => (
                  <Th key={f.key}>{f.label}</Th>
                ))}
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
                <TableSkeleton rows={5} cols={14 + tableAttributeFields.length} />
              ) : items.length === 0 ? (
                <TableEmpty
                  colSpan={14 + tableAttributeFields.length}
                  message={search ? `No items match "${search}".` : "No items yet. Click 'New Item' to get started."}
                />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => openEdit(item.id)}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{item.ean ?? '-'}</TableCell>
                    {tableAttributeFields.map((f) => (
                      <TableCell key={f.key} className="text-zinc-500">
                        {formatAttributeValue(item.attributes?.[f.key])}
                      </TableCell>
                    ))}
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate({ to: '/masters/items/new', search: { duplicateOf: item.id } })}
                          aria-label={`Duplicate ${item.name}`}
                          title="Duplicate to create a variant"
                        >
                          <Copy size={14} />
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

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

/**
 * CSV export with a dynamic columns section driven by the tenant's
 * attribute schema. Universal columns (identity, pricing, category,
 * status) are fixed; every schema attribute becomes its own column so
 * the export stays complete regardless of industry.
 */
function exportItemsCsv(items: Item[], schema: ItemAttributeField[]): void {
  const fixedHeaders = [
    'Name', 'SKU', 'EAN', 'Type', 'HSN/SAC', 'Unit',
    'Selling Price', 'Purchase Price', 'MRP', 'Cost Price', 'Basic Price',
    'GST%', 'GST Value', 'Margin %',
    'Category', 'Subcategory', 'Description', 'Status',
  ];
  const headers = [...fixedHeaders, ...schema.map((f) => f.label)];
  const rows = items.map((i) => {
    const fixed = [
      i.name, i.sku ?? '', i.ean ?? '', i.type, i.hsnSacCode ?? '', i.unit ?? '',
      String(i.defaultSellingPrice ?? ''), String(i.defaultPurchasePrice ?? ''),
      String(i.mrp ?? ''), String(i.costPrice ?? ''), String(i.basicPrice ?? ''),
      String(i.gstRate ?? ''), String(i.gstValue ?? ''), String(i.margin ?? ''),
      i.category ?? '', i.subcategory ?? '', i.description ?? '',
      i.isActive ? 'Active' : 'Inactive',
    ];
    const dynamic = schema.map((f) => {
      const v = i.attributes?.[f.key];
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      return String(v);
    });
    return [...fixed, ...dynamic];
  });
  downloadCSV('items.csv', headers, rows);
}
