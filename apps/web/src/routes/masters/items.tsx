import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import XLSX from 'xlsx-js-style';
import { Plus, Download, Power, Sparkles, Trash2, Search, Calculator, Copy, TrendingUp, ChevronDown, FileSpreadsheet, FileText, Package } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  TableSkeleton, useToast, ConfirmationDialog,
} from '@/components/ui';
import {
  PageHeader, Button, Badge, Input, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState,
} from '@/components/ar/primitives';
import { formatINR, formatINRShort } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { Item } from '@/hooks/queries/use-items';
import type { ItemAttributeField, PaginatedResponse } from '@runq/types';
import {
  useItems, useToggleItem, useDeleteItem, useItemAttributeSchema,
} from '@/hooks/queries/use-items';

const LIMIT = 25;

async function fetchAllItems(): Promise<Item[]> {
  const all: Item[] = [];
  let page = 1;
  const limit = 500;
  let totalPages = 1;
  do {
    const res = await api.get<PaginatedResponse<Item>>(`/masters/items?limit=${limit}&page=${page}`);
    all.push(...res.data);
    totalPages = res.meta.totalPages;
    page++;
  } while (page <= totalPages);
  return all;
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
  // Search + page are URL-backed so navigating to edit and back preserves
  // the filtered list. The previous local-state implementation reset on
  // every route change.
  const params = useSearch({ strict: false }) as { q?: string; page?: number };
  const search = params.q ?? '';
  const page = params.page ?? 1;

  function updateSearch(patch: { q?: string; page?: number }, resetPage = true) {
    navigate({
      to: '/masters/items',
      search: (prev) => {
        const next = { ...(prev as typeof params), ...patch };
        if (resetPage) next.page = undefined;
        for (const k of Object.keys(next) as (keyof typeof next)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }
  const setSearch = (v: string) => updateSearch({ q: v || undefined });
  const setPage = (p: number) => updateSearch({ page: p > 1 ? p : undefined }, false);

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

  // KPI computation from current page
  const activeCount = items.filter((i) => i.isActive).length;
  const productCount = items.filter((i) => i.type === 'product').length;
  const serviceCount = items.filter((i) => i.type === 'service').length;
  const avgMargin = items.length > 0
    ? Math.round(items.reduce((a, i) => a + (i.margin ?? 0), 0) / items.length)
    : 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Inventory', href: '/masters/items' }, { label: 'Items' }]}
        title="Items"
        description="Products and services used across invoices and bills."
        actions={
          <>
            <div className="relative" ref={exportRef}>
              <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={() => setExportOpen((v) => !v)}>
                Export <ChevronDown size={12} />
              </Button>
              {exportOpen && (
                <div
                  className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border py-1"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)' }}
                >
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-1)' }}
                    onClick={async () => { setExportOpen(false); const all = await fetchAllItems(); exportItemsCsv(all, schema); }}
                  >
                    <FileText size={13} /> Export CSV
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-1)' }}
                    onClick={async () => { setExportOpen(false); const all = await fetchAllItems(); exportItemsForCustomer(all); }}
                  >
                    <FileSpreadsheet size={13} /> Export for customer
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" icon={<TrendingUp size={13} />} onClick={() => navigate({ to: '/masters/items/profitability' })}>
              Profitability
            </Button>
            <Button variant="outline" size="sm" icon={<Sparkles size={13} />} onClick={() => navigate({ to: '/masters/items/import' })}>
              Smart import
            </Button>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/masters/items/new' })}>
              New item
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total items" value={total} sub={`${activeCount} active in view`} />
        <StatTile label="Products" value={productCount} sub="Stock-keeping units" />
        <StatTile label="Services" value={serviceCount} sub="Non-stock items" />
        <StatTile label="Avg. margin" value={`${avgMargin}%`} sub="Across listed items" tone={avgMargin > 0 ? 'pos' : 'neutral'} />
      </div>

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} items</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>UOM</Th>
            <Th>EAN</Th>
            <Th>HSN / SAC</Th>
            <Th align="right">Selling price</Th>
            <Th align="right">MRP</Th>
            <Th align="right">GST</Th>
            <Th align="right">Margin</Th>
            <Th>Category</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={6} cols={10} />
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <EmptyState
                  icon={<Package size={18} />}
                  title={search ? `No items match "${search}"` : 'No items yet'}
                  description={search ? 'Try a different search term.' : 'Add your first item to get started.'}
                  action={!search && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/masters/items/new' })}>
                      New item
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : items.map((item) => (
            <TableRow key={item.id} onClick={() => openEdit(item.id)}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>{item.name}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                  {item.sku && <span className="num">{item.sku}</span>}
                  <Badge variant="default">{item.type}</Badge>
                  {tableAttributeFields.map((f) => {
                    const v = formatAttributeValue(item.attributes?.[f.key]);
                    return v !== '-' ? <span key={f.key}>{v}</span> : null;
                  })}
                </div>
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{item.unit ?? '—'}</TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{item.ean ?? '—'}</TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{item.hsnSacCode ?? '—'}</TableCell>
              <TableCell align="right" numeric>
                {item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell align="right" numeric style={{ color: 'var(--text-2)' }}>
                {item.mrp != null ? formatINR(item.mrp) : '—'}
              </TableCell>
              <TableCell align="right" numeric style={{ color: 'var(--text-2)' }}>
                {item.gstRate != null ? `${item.gstRate}%` : '—'}
              </TableCell>
              <TableCell align="right" numeric>
                {item.margin != null ? (
                  <span style={{ color: item.margin >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{item.margin}%</span>
                ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {item.category ? (
                  <>{item.category}{item.subcategory && <span style={{ color: 'var(--text-3)' }}> / {item.subcategory}</span>}</>
                ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell>
                <Badge variant={item.isActive ? 'success' : 'outline'}>{item.isActive ? 'Active' : 'Inactive'}</Badge>
              </TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => openAnalysis(item.id)}
                    title="Cost & profit analysis"
                  >
                    <Calculator size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => navigate({ to: '/masters/items/new', search: { duplicateOf: item.id } })}
                    title="Duplicate"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => handleToggle(item.id)}
                    disabled={toggle.isPending}
                    title={item.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <Power size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[var(--neg-soft)]"
                    style={{ color: 'var(--neg)' }}
                    onClick={() => setDeletingId(item.id)}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
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
  const columns = ['S.No', 'Category', 'Subcategory', 'Item', 'Unit', 'SKU', 'HSN/SAC', 'MRP', 'Margin %', 'Basic Price', 'GST %', 'GST Value', 'Landing (incl. GST)'];
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
    i.margin != null ? `${i.margin}%` : '',
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

  // Currency columns: MRP=7, Basic Price=9, GST Value=11, Landing=12
  const currencyCols = [7, 9, 11, 12];
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
