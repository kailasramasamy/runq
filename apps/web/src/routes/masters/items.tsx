import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch, useRouterState } from '@tanstack/react-router';
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
import {
  InvClassTabs, resolveDefaultClassGroup, type ItemClassGroup,
} from '@/components/inventory/inv-class-tabs';
import { groupItemsByClass, ItemSectionRow } from '@/components/inventory/item-sections';
import type { Item } from '@/hooks/queries/use-items';
import type { ItemAttributeField, PaginatedResponse } from '@runq/types';
import {
  useItems, useItemClassCounts, useBulkUpdateItemClass, useToggleItem, useDeleteItem, useItemAttributeSchema,
} from '@/hooks/queries/use-items';
import type { ItemClass } from '@/hooks/queries/use-items';

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
  // Mirrors live under both /finance/masters/items (Finance module) and
  // /inventory/items (Inventory module). The page uses the same component
  // tree in both spots; we detect which root we're on so internal nav
  // (edit / new / import / analysis) keeps the user in the same module.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const itemsBase = pathname.startsWith('/inventory')
    ? '/inventory/items'
    : pathname.startsWith('/purchase')
      ? '/purchase/items'
      : '/finance/masters/items';
  // Default tab varies by module so each ops surface lands on what's relevant:
  // Purchase users care about inputs (raw material, packaging); finance/sales
  // users default to finished. Explicit ?classGroup in the URL still wins.
  // Inventory opens on All and leans on the class sections to keep the list
  // legible — on that surface the question is "what's in the catalogue",
  // not "what can I sell". Finance and Purchase keep their focused defaults.
  const moduleDefaultClassGroup: ItemClassGroup = pathname.startsWith('/purchase')
    ? 'inputs'
    : pathname.startsWith('/inventory')
      ? 'all'
      : 'finished';
  // Search + page are URL-backed so navigating to edit and back preserves
  // the filtered list. The previous local-state implementation reset on
  // every route change.
  const params = useSearch({ strict: false }) as { q?: string; page?: number; classGroup?: string };
  const search = params.q ?? '';
  const page = params.page ?? 1;
  // Server-side per-bucket counts — feeds the tab badges and lets the
  // fall-through resolver land on the first non-empty bucket when the
  // tenant's catalogue doesn't include the preferred default yet (e.g.
  // a pre-classification tenant with only trading_good items shouldn't
  // open this page on an empty Finished tab).
  const classCounts = useItemClassCounts();
  const counts = classCounts.data?.data;
  const urlGroup =
    params.classGroup === 'finished' || params.classGroup === 'inputs' ||
    params.classGroup === 'trading' || params.classGroup === 'other' ||
    params.classGroup === 'all'
      ? params.classGroup
      : null;
  const classGroup: ItemClassGroup = urlGroup ?? resolveDefaultClassGroup(moduleDefaultClassGroup, counts);

  // Wrap navigate in a loose-typed shim. The router's overloads are
  // string-literal-driven, so a dynamic prefix breaks the inference for
  // `search` / `params`. The call shapes themselves are already validated
  // by the per-route validateSearch on both module roots.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigate as unknown as (opts: any) => void;

  function updateSearch(patch: { q?: string; page?: number; classGroup?: string }, resetPage = true) {
    nav({
      to: itemsBase,
      search: (prev: typeof params) => {
        const next = { ...prev, ...patch };
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
    ...(classGroup !== 'all' ? { itemClassGroup: classGroup } : {}),
    // Inventory sorts by activity so a freshly received batch surfaces
    // instead of sitting pages down under its initial letter. The finance
    // and purchase catalogues stay alphabetical.
    ...(pathname.startsWith('/inventory') ? { sort: 'recent' as const } : {}),
  });
  const { data: schemaRes } = useItemAttributeSchema();
  const toggle = useToggleItem();
  const remove = useDeleteItem();
  const bulkReclassify = useBulkUpdateItemClass();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // Multi-select for bulk reclassify. Set of item ids; reset when the
  // page or filter changes so a stale selection from page 1 doesn't leak
  // into page 2. Tracked as a Set so toggling stays O(1).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, classGroup, search]);

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

  // On 'all' the table is split into class-group sections; under a single
  // bucket every row shares a group, so a lone header would be noise. The
  // server orders by class rank, so a section never straddles a page break.
  type ItemEntry = { header?: { label: string; count: number }; item?: (typeof items)[number] };
  const displayEntries: ItemEntry[] = classGroup === 'all'
    ? groupItemsByClass(items).flatMap((s) => [
        { header: { label: s.label, count: s.rows.length } },
        ...s.rows.map((item) => ({ item })),
      ])
    : items.map((item) => ({ item }));

  // Pick up to 2 short-form schema fields for the desktop table — textarea
  // fields are too long, so skip them. The rest of the schema still shows
  // up in the CSV export so power users can get every attribute.
  const schema: ItemAttributeField[] = schemaRes?.data ?? [];
  const tableAttributeFields = useMemo(
    () => schema.filter((f) => f.type !== 'textarea').slice(0, 2),
    [schema],
  );

  const openEdit = (id: string) =>
    nav({ to: `${itemsBase}/$itemId/edit`, params: { itemId: id } });
  const openAnalysis = (id: string) =>
    nav({
      to: `${itemsBase}/$itemId/analysis`,
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
      <PageHeader fullWidth
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
            <Button variant="outline" size="sm" icon={<TrendingUp size={13} />} onClick={() => nav({ to: `${itemsBase}/profitability` })}>
              Profitability
            </Button>
            <Button variant="outline" size="sm" icon={<Sparkles size={13} />} onClick={() => nav({ to: `${itemsBase}/import` })}>
              Smart import
            </Button>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => nav({ to: `${itemsBase}/new` })}>
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

      <div className="mb-3">
        <InvClassTabs
          selected={classGroup}
          counts={counts}
          onChange={(g) => updateSearch({ classGroup: g })}
        />
      </div>

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

      {selectedIds.size > 0 && (
        <BulkReclassifyBar
          count={selectedIds.size}
          busy={bulkReclassify.isPending}
          onClear={() => setSelectedIds(new Set())}
          onApply={async (cls) => {
            try {
              await bulkReclassify.mutateAsync({
                itemIds: Array.from(selectedIds),
                itemClass: cls,
              });
              toast(`Reclassified ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`, 'success');
              setSelectedIds(new Set());
            } catch {
              toast('Bulk reclassify failed', 'error');
            }
          }}
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Select all on page"
                checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                ref={(el) => {
                  if (!el) return;
                  const selectedOnPage = items.filter((i) => selectedIds.has(i.id)).length;
                  el.indeterminate = selectedOnPage > 0 && selectedOnPage < items.length;
                }}
                onChange={(e) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) items.forEach((i) => next.add(i.id));
                    else items.forEach((i) => next.delete(i.id));
                    return next;
                  });
                }}
              />
            </Th>
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
            <TableSkeleton rows={6} cols={11} />
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={11}>
                <EmptyState
                  icon={<Package size={18} />}
                  title={search ? `No items match "${search}"` : 'No items yet'}
                  description={search ? 'Try a different search term.' : 'Add your first item to get started.'}
                  action={!search && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => nav({ to: `${itemsBase}/new` })}>
                      New item
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : displayEntries.map((entry) => {
            if (entry.header) {
              return (
                <ItemSectionRow
                  key={`section-${entry.header.label}`}
                  label={entry.header.label}
                  count={entry.header.count}
                  colSpan={12}
                />
              );
            }
            const item = entry.item!;
            return (
            <TableRow key={item.id} onClick={() => openEdit(item.id)}>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${item.name}`}
                  checked={selectedIds.has(item.id)}
                  onChange={(e) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
              </TableCell>
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
                    onClick={() => nav({ to: `${itemsBase}/new`, search: { duplicateOf: item.id } })}
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
            );
          })}
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

// ─── Bulk reclassify action bar ─────────────────────────────────────────────
//
// Renders above the items table whenever one or more rows are selected.
// Designed for the Phase-1 backfill cleanup — every existing product was
// seeded as 'trading_good', so a dairy SME typically wants to multi-select
// finished goods (butter, curd, ghee) and flip them to 'finished_good' in
// one shot. The bar disappears when the selection is cleared.
function BulkReclassifyBar({
  count, busy, onApply, onClear,
}: {
  count: number;
  busy: boolean;
  onApply: (cls: ItemClass) => void;
  onClear: () => void;
}) {
  const [cls, setCls] = useState<ItemClass | ''>('');
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
      <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {count} item{count === 1 ? '' : 's'} selected
      </span>
      <span className="text-xs text-amber-800/70 dark:text-amber-200/70">Set class to</span>
      <select
        value={cls}
        onChange={(e) => setCls(e.target.value as ItemClass | '')}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm dark:border-amber-700 dark:bg-zinc-900"
      >
        <option value="">Pick class…</option>
        <option value="finished_good">Finished good</option>
        <option value="semi_finished">Semi-finished</option>
        <option value="raw_material">Raw material</option>
        <option value="packaging">Packaging</option>
        <option value="trading_good">Trading good</option>
        <option value="consumable">Consumable</option>
        <option value="spare_part">Spare part</option>
      </select>
      <Button
        size="sm"
        disabled={!cls || busy}
        loading={busy}
        onClick={() => cls && onApply(cls)}
      >
        Apply
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
        Clear
      </Button>
    </div>
  );
}
