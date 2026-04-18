import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import XLSX from 'xlsx-js-style';
import { Plus, Download, Power, Sparkles, Trash2, Search, Calculator, Copy, TrendingUp, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast, ConfirmationDialog, Pagination,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { Item } from '@/hooks/queries/use-items';
import type { ItemAttributeField, PaginatedResponse } from '@runq/types';
import {
  useItems, useToggleItem, useDeleteItem, useItemAttributeSchema,
} from '@/hooks/queries/use-items';

const LIMIT = 20;

async function fetchAllItems(): Promise<Item[]> {
  const res = await api.get<PaginatedResponse<Item>>('/masters/items?limit=10000');
  return res.data;
}

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
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

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
            <div className="relative" ref={exportRef}>
              <Button variant="outline" size="sm" onClick={() => setExportOpen((v) => !v)}>
                <Download size={14} /> Export <ChevronDown size={12} />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={async () => { setExportOpen(false); const all = await fetchAllItems(); exportItemsCsv(all, schema); }}
                  >
                    <FileText size={14} /> Export CSV
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={async () => { setExportOpen(false); const all = await fetchAllItems(); exportItemsForCustomer(all); }}
                  >
                    <FileSpreadsheet size={14} /> Export for Customer
                  </button>
                </div>
              )}
            </div>
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
                <Th className="w-[320px] min-w-[280px]">Name</Th>
                <Th>EAN</Th>
                <Th>HSN/SAC</Th>
                <Th align="right">Landing Price</Th>
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
                <TableSkeleton rows={5} cols={10} />
              ) : items.length === 0 ? (
                <TableEmpty
                  colSpan={10}
                  message={search ? `No items match "${search}".` : "No items yet. Click 'New Item' to get started."}
                />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => openEdit(item.id)}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{item.name}</span>
                        {item.unit && <Badge variant="outline" className="ml-1 align-middle">{item.unit}</Badge>}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                          {item.sku && <span className="font-mono">{item.sku}</span>}
                          <Badge variant="default">{item.type}</Badge>
                          {tableAttributeFields.map((f) => {
                            const v = formatAttributeValue(item.attributes?.[f.key]);
                            return v !== '-' ? <span key={f.key}>{v}</span> : null;
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.ean ?? '-'}</TableCell>
                    <TableCell className="text-zinc-500">{item.hsnSacCode ?? '-'}</TableCell>
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
function sortByCategorySubcategory(a: Item, b: Item): number {
  const catA = (a.category ?? '').toLowerCase();
  const catB = (b.category ?? '').toLowerCase();
  if (catA !== catB) return catA.localeCompare(catB);
  const subA = (a.subcategory ?? '').toLowerCase();
  const subB = (b.subcategory ?? '').toLowerCase();
  return subA.localeCompare(subB);
}

function exportItemsCsv(items: Item[], schema: ItemAttributeField[]): void {
  const sorted = [...items].sort(sortByCategorySubcategory);
  const fixedHeaders = [
    'Name', 'SKU', 'EAN', 'Type', 'HSN/SAC', 'Unit',
    'Landing Price', 'Purchase Price', 'MRP', 'Cost Price', 'Basic Price',
    'GST%', 'GST Value', 'Margin %',
    'Category', 'Subcategory', 'Description', 'Status',
  ];
  const headers = [...fixedHeaders, ...schema.map((f) => f.label)];
  const rows = sorted.map((i) => {
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

/**
 * XLSX export for sharing with customers — includes only customer-relevant
 * columns: item identity, MRP, basic cost, GST, and landing cost (incl. GST).
 * Styled with professional headers and formatting matching the price-list export.
 */
function exportItemsForCustomer(items: Item[]): void {
  const columns = ['S.No', 'Category', 'Subcategory', 'Item', 'Unit', 'SKU', 'HSN/SAC', 'MRP', 'Basic Price', 'GST %', 'GST Value', 'Landing Price (incl. GST)'];
  const sorted = items.filter((i) => i.isActive).sort(sortByCategorySubcategory);
  const dataRows = sorted.map((i, idx) => [
    idx + 1,
    i.category ?? '',
    i.subcategory ?? '',
    i.name,
    i.unit ?? '',
    i.sku ?? '',
    i.hsnSacCode ?? '',
    i.mrp ?? '',
    i.basicPrice ?? '',
    i.gstRate ?? '',
    i.gstValue ?? '',
    i.defaultSellingPrice ?? '',
  ]);

  const sheetData = [columns, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Style column header row
  const colHeaderStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: '1F2937' } },
    alignment: { horizontal: 'center' as const },
    border: { bottom: { style: 'thin' as const, color: { rgb: '000000' } } },
  };
  for (let c = 0; c < columns.length; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = colHeaderStyle;
  }

  // Currency columns: MRP=7, Basic Price=8, GST Value=10, Landing=11
  const currencyCols = [7, 8, 10, 11];
  const currencyStyle = { numFmt: '#,##0.00', alignment: { horizontal: 'right' as const } };
  for (let r = 0; r < dataRows.length; r++) {
    for (const c of currencyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
      if (cell) cell.s = currencyStyle;
    }
  }

  // Alternate row shading
  for (let r = 0; r < dataRows.length; r++) {
    if (r % 2 === 1) {
      for (let c = 0; c < columns.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
        if (cell) cell.s = { ...cell.s, fill: { fgColor: { rgb: 'F3F4F6' } } };
      }
    }
  }

  // Auto-fit column widths
  const currencyColSet = new Set(currencyCols);
  ws['!cols'] = columns.map((col, i) => ({
    wch: Math.max(col.length, ...dataRows.map((r) => String(r[i] ?? '').length)) + (currencyColSet.has(i) ? 5 : 2),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  XLSX.writeFile(wb, 'items-customer.xlsx');
}
