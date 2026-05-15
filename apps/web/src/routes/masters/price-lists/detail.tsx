import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Pencil, Power, ArrowLeft, Download, Check, X, Trash2, Calculator, Plus } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import {
  usePriceList,
  useTogglePriceList,
  useUpdatePriceList,
  type PriceListItemRow,
  type PriceListItemInput,
} from '@/hooks/queries/use-price-lists';
import { useItems, type Item } from '@/hooks/queries/use-items';
import { formatINR } from '@/lib/utils';
import { calculatePricing } from '@/lib/item-pricing';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th, Input,
  CardSkeleton, useToast, Modal, Combobox,
} from '@/components/ui';
import { PriceCalculatorDialog } from '../price-lists';

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

function applyToLabel(applyTo: string, value: string | null, customerName?: string | null, vendorName?: string | null) {
  switch (applyTo) {
    case 'all': return 'All';
    case 'customer_group': return `Customer Group: ${value}`;
    case 'vendor_group': return `Vendor Group: ${value}`;
    case 'customer': return customerName ?? value ?? '—';
    case 'vendor': return vendorName ?? value ?? '—';
    default: return applyTo;
  }
}

/** Compute the effective pricing breakup for a price list item row. */
function computeBreakup(item: PriceListItemRow) {
  const effectiveMrp = item.mrp ?? item.itemMrp ?? null;
  const effectiveMargin = item.marginPercent ?? item.itemMargin ?? null;
  const gstRate = item.itemGstRate ?? 0;
  const costPrice = item.itemCostPrice ?? 0;

  // If an absolute rate is set, derive from that
  if (item.rate != null) {
    const basicPrice = item.rate;
    const gstValue = basicPrice * (gstRate / 100);
    const landingPrice = basicPrice + gstValue;
    const discount = item.discountPercent ?? 0;
    const effectiveRate = basicPrice * (1 - discount / 100);
    const profitPerUnit = effectiveRate - costPrice;
    return {
      effectiveMrp,
      effectiveMargin,
      basicPrice: Math.round(basicPrice * 100) / 100,
      gstValue: Math.round(gstValue * 100) / 100,
      landingPrice: Math.round(landingPrice * 100) / 100,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      costPrice,
      profitPerUnit: Math.round(profitPerUnit * 100) / 100,
      source: 'rate' as const,
    };
  }

  // MRP-anchored pricing
  if (effectiveMrp != null && effectiveMargin != null) {
    const pricing = calculatePricing({
      mrp: effectiveMrp,
      sellerMarginPct: effectiveMargin,
      gstRatePct: gstRate,
      cogm: costPrice,
    });
    const discount = item.discountPercent ?? 0;
    const effectiveRate = pricing.basicPrice * (1 - discount / 100);
    const profitAfterDiscount = effectiveRate - costPrice;
    return {
      effectiveMrp,
      effectiveMargin,
      basicPrice: pricing.basicPrice,
      gstValue: pricing.gstValue,
      landingPrice: pricing.landingPrice,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      costPrice,
      profitPerUnit: Math.round(profitAfterDiscount * 100) / 100,
      source: 'mrp' as const,
    };
  }

  return null;
}

const profitColor = (profit: number) =>
  profit < 0
    ? 'text-red-600 dark:text-red-400'
    : profit === 0
    ? 'text-zinc-500'
    : 'text-emerald-600 dark:text-emerald-400';

/** Convert a stored item row back into the shape the update endpoint
 *  expects, so we can rebuild the full items array on a per-row save. */
function toInputShape(item: PriceListItemRow): PriceListItemInput {
  return {
    itemId: item.itemId,
    rate: item.rate ?? null,
    marginPercent: item.marginPercent ?? null,
    mrp: item.mrp ?? null,
    discountPercent: item.discountPercent ?? null,
    minQuantity: item.minQuantity ?? 0,
  };
}

/** Editable draft state for a single row. All numbers held as strings so
 *  blanks (= "fall back to item-master") are distinguishable from zero. */
interface RowDraft {
  rate: string;
  mrp: string;
  marginPercent: string;
  discountPercent: string;
  minQuantity: string;
}

function draftFromRow(item: PriceListItemRow): RowDraft {
  return {
    rate: item.rate != null ? String(item.rate) : '',
    mrp: item.mrp != null ? String(item.mrp) : '',
    marginPercent: item.marginPercent != null ? String(item.marginPercent) : '',
    discountPercent: item.discountPercent != null ? String(item.discountPercent) : '',
    minQuantity: item.minQuantity != null ? String(item.minQuantity) : '',
  };
}

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function PriceListDetailPage({ priceListId }: { priceListId: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  function goBack(): void {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/masters/price-lists' });
  }
  const { data, isLoading, isError } = usePriceList(priceListId);
  const toggle = useTogglePriceList();
  const update = useUpdatePriceList();
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);
  /** Map of item-row id → draft. Multiple rows can be edited in parallel;
   *  each one saves independently. */
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  /** Row id whose calculator dialog is open. */
  const [calcRowId, setCalcRowId] = useState<string | null>(null);
  /** Add-item modal state. */
  const [addOpen, setAddOpen] = useState(false);
  const [addItemId, setAddItemId] = useState<string>('');
  const { data: itemsData } = useItems({ limit: 500 });

  /** Build the minimal Item shape the calculator needs from the price-list
   *  row (which already carries every master field via the join). Avoids a
   *  second fetch and stays correct even for >500-item tenants. */
  function rowToItemMaster(row: PriceListItemRow): Item {
    return {
      id: row.itemId,
      name: row.itemName ?? '—',
      sku: row.itemSku ?? null,
      type: 'product',
      hsnSacCode: row.itemHsnSacCode ?? null,
      unit: row.itemUnit ?? null,
      packSizeValue: null,
      packSizeUqc: null,
      defaultSellingPrice: null,
      defaultPurchasePrice: null,
      gstRate: row.itemGstRate ?? null,
      mrp: row.itemMrp ?? null,
      costPrice: row.itemCostPrice ?? null,
      category: row.itemCategory ?? null,
      subcategory: row.itemSubcategory ?? null,
      description: null,
      ean: null,
      margin: row.itemMargin ?? null,
      basicPrice: row.itemBasicPrice ?? null,
      gstValue: null,
      attributes: null,
      cogmBreakdown: null,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };
  }

  const pl = data?.data ?? null;
  const items = pl?.items ?? [];

  function startEdit(row: PriceListItemRow) {
    setDrafts((d) => ({ ...d, [row.id]: draftFromRow(row) }));
  }
  function cancelEdit(rowId: string) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[rowId];
      return next;
    });
  }
  function setDraftField(rowId: string, field: keyof RowDraft, value: string) {
    setDrafts((d) => ({ ...d, [rowId]: { ...d[rowId]!, [field]: value } }));
  }

  /** Save a single row. The update endpoint replaces the full items array,
   *  so we send every row with this one's draft applied. */
  async function saveRow(row: PriceListItemRow) {
    const draft = drafts[row.id];
    if (!draft) return;
    const nextItems: PriceListItemInput[] = items.map((it) => {
      if (it.id !== row.id) return toInputShape(it);
      return {
        ...toInputShape(it),
        rate: num(draft.rate),
        mrp: num(draft.mrp),
        marginPercent: num(draft.marginPercent),
        discountPercent: num(draft.discountPercent),
        minQuantity: num(draft.minQuantity) ?? 0,
      };
    });
    try {
      await update.mutateAsync({ id: priceListId, data: { items: nextItems } });
      toast('Price updated', 'success');
      cancelEdit(row.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  }

  /** Append a new item to the price list. Seed the row with the item
   *  master's MRP / margin so the API contract (at least one of
   *  rate / margin / MRP) is satisfied — the user can override afterwards. */
  async function addItem() {
    if (!addItemId) return;
    if (items.some((it) => it.itemId === addItemId)) {
      toast('Item is already in this price list', 'error');
      return;
    }
    const master = (itemsData?.data ?? []).find((i) => i.id === addItemId);
    const seedMrp = master?.mrp ?? null;
    const seedMargin = master?.margin ?? null;
    if (seedMrp == null && seedMargin == null) {
      toast('This item has no MRP or margin set — open it in Items first.', 'error');
      return;
    }
    const nextItems: PriceListItemInput[] = [
      ...items.map(toInputShape),
      {
        itemId: addItemId,
        rate: null,
        marginPercent: seedMargin,
        mrp: seedMrp,
        discountPercent: null,
        minQuantity: 0,
      },
    ];
    try {
      await update.mutateAsync({ id: priceListId, data: { items: nextItems } });
      toast('Item added', 'success');
      setAddOpen(false);
      setAddItemId('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Add failed', 'error');
    }
  }

  /** Remove a single row from the price list. */
  async function deleteRow(row: PriceListItemRow) {
    if (!confirm(`Remove ${row.itemName ?? 'this item'} from this price list?`)) return;
    const nextItems: PriceListItemInput[] = items
      .filter((it) => it.id !== row.id)
      .map(toInputShape);
    try {
      await update.mutateAsync({ id: priceListId, data: { items: nextItems } });
      toast('Item removed', 'success');
      cancelEdit(row.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Remove failed', 'error');
    }
  }

  async function handleToggle() {
    if (!pl) return;
    setToggling(true);
    try {
      await toggle.mutateAsync(pl.id);
      toast('Status updated', 'success');
    } catch {
      toast('Failed to toggle status', 'error');
    } finally {
      setToggling(false);
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader fullWidth
          title="Price List"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Price Lists', href: '/masters/price-lists' }, { label: '…' }]}
        />
        <div className="flex flex-col gap-6 max-w-6xl">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !pl) {
    return (
      <div>
        <PageHeader
          title="Price List"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Price Lists', href: '/masters/price-lists' }, { label: 'Not Found' }]}
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-zinc-500">
            Price list not found.
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/finance/masters/price-lists' })}>
                <ArrowLeft size={14} /> Back to Price Lists
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function exportXlsx() {
    if (!pl) return;

    const columns = ['S.No', 'Category', 'Subcategory', 'Item', 'Unit', 'SKU', 'HSN/SAC', 'MRP', 'Margin %', 'Basic Rate', 'GST %', 'GST Value', 'Landing (incl. GST)'];
    const dataRows = items.map((item, idx) => {
      const breakup = computeBreakup(item);
      return [
        idx + 1,
        item.itemCategory ?? '',
        item.itemSubcategory ?? '',
        item.itemName ?? '',
        item.itemUnit ?? '',
        item.itemSku ?? '',
        item.itemHsnSacCode ?? '',
        breakup?.effectiveMrp ?? '',
        breakup?.effectiveMargin != null ? `${breakup.effectiveMargin}%` : '',
        breakup ? breakup.basicPrice : '',
        item.itemGstRate ?? '',
        breakup ? breakup.gstValue : '',
        breakup ? breakup.landingPrice : '',
      ];
    });

    const sheetData = [columns, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Style column header row (white text on dark background)
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

    // Currency columns: MRP=7, Basic Rate=9, GST Value=11, Landing=12
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

    // Compact column widths
    const currencyColSet = new Set(currencyCols);
    ws['!cols'] = columns.map((col, i) => ({
      wch: Math.max(col.length, ...dataRows.map((r) => String(r[i] ?? '').length)) + (currencyColSet.has(i) ? 3 : 1),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Price List');
    const filename = `${pl.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  return (
    <div>
      <PageHeader fullWidth
        title={pl.name}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Price Lists', href: '/masters/price-lists' },
          { label: pl.name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx}>
              <Download size={14} /> Export XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={handleToggle} disabled={toggling}>
              <Power size={14} /> {pl.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        }
      />

      {/* Header info */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Details" />
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <DetailField label="Type" value={pl.type === 'selling' ? 'Selling' : 'Buying'} />
            <DetailField label="Currency" value={pl.currency} />
            <DetailField label="Apply To" value={applyToLabel(pl.applyTo, pl.applyToValue, pl.customerName, pl.vendorName)} />
            <DetailField label="Valid From" value={pl.validFrom} />
            <DetailField label="Valid To" value={pl.validTo} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Status</p>
              <div className="mt-0.5">
                <Badge variant={pl.isActive ? 'success' : 'default'}>
                  {pl.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line items with full pricing breakup */}
        <Card>
          <CardHeader
            title={`Pricing Breakup (${items.length} items)`}
            action={
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={update.isPending}>
                <Plus size={13} /> Add item
              </Button>
            }
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Item</Th>
                    <Th>SKU</Th>
                    <Th>Unit</Th>
                    <Th align="right">COGM</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">MRP</Th>
                    <Th align="right">Margin %</Th>
                    <Th align="right">Basic Price</Th>
                    <Th align="right">GST</Th>
                    <Th align="right">Landing</Th>
                    <Th align="right">Disc %</Th>
                    <Th align="right">Profit</Th>
                    <Th align="right">Min Qty</Th>
                    <Th align="right" className="w-36" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableEmpty colSpan={14} message="No items in this price list." />
                  ) : (
                    items.map((item) => {
                      const editing = drafts[item.id];
                      // While editing, compute breakup from a draft-merged view
                      // so Basic Price / GST / Landing / Profit update live as
                      // the user changes Rate / MRP / Margin / Discount —
                      // including via the Price Calculator. Once saved, the
                      // server snapshot drives display again.
                      const itemForBreakup = editing
                        ? {
                            ...item,
                            rate: num(editing.rate),
                            mrp: num(editing.mrp),
                            marginPercent: num(editing.marginPercent),
                            discountPercent: num(editing.discountPercent),
                            minQuantity: num(editing.minQuantity) ?? 0,
                          }
                        : item;
                      const breakup = computeBreakup(itemForBreakup);
                      const isOverride = (field: 'mrp' | 'marginPercent') =>
                        item[field] != null;
                      const saving = update.isPending;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {item.itemName ?? '—'}
                          </TableCell>
                          <TableCell className="text-zinc-500 text-xs">
                            {item.itemSku ?? '—'}
                          </TableCell>
                          <TableCell className="text-zinc-500 text-xs">
                            {item.itemUnit ?? '—'}
                          </TableCell>
                          <TableCell align="right" numeric className="text-zinc-500">
                            {breakup?.costPrice != null ? formatINR(breakup.costPrice) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {editing ? (
                              <Input
                                type="number"
                                value={editing.rate}
                                onChange={(e) => setDraftField(item.id, 'rate', e.target.value)}
                                placeholder={item.itemBasicPrice != null ? String(item.itemBasicPrice) : '0.00'}
                                title="Basic price per unit (excludes GST). Leave blank to derive from MRP × (1 - margin) / (1 + gst)."
                                className="w-24 text-right"
                              />
                            ) : item.rate != null ? (
                              formatINR(item.rate)
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {editing ? (
                              <Input
                                type="number"
                                value={editing.mrp}
                                onChange={(e) => setDraftField(item.id, 'mrp', e.target.value)}
                                placeholder={item.itemMrp != null ? String(item.itemMrp) : '—'}
                                className="w-24 text-right"
                              />
                            ) : breakup?.effectiveMrp != null ? (
                              <span title={isOverride('mrp') ? 'Overridden by price list' : 'From item master'}>
                                {formatINR(breakup.effectiveMrp)}
                                {isOverride('mrp') && (
                                  <span className="ml-1 text-[10px] text-amber-500">*</span>
                                )}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {editing ? (
                              <>
                                <Input
                                  type="number"
                                  value={editing.marginPercent}
                                  onChange={(e) => setDraftField(item.id, 'marginPercent', e.target.value)}
                                  placeholder={item.itemMargin != null ? String(item.itemMargin) : '—'}
                                  className="w-20 text-right"
                                />
                                {(() => {
                                  // Live preview: when rate is blank but we have MRP + margin,
                                  // show the basic price the resolver will compute at invoice
                                  // time. Mirrors the bulk-edit form's "→ rate ≈" hint.
                                  if (num(editing.rate) != null) return null;
                                  const effMrp = num(editing.mrp) ?? item.itemMrp ?? null;
                                  const effMargin = num(editing.marginPercent) ?? item.itemMargin ?? null;
                                  if (effMrp == null || effMargin == null) return null;
                                  const gst = item.itemGstRate ?? 0;
                                  const landing = effMrp * (1 - effMargin / 100);
                                  const basic = landing / (1 + gst / 100);
                                  return (
                                    <p
                                      className="mt-1 text-right text-[10px] text-emerald-600 dark:text-emerald-400"
                                      title="Basic price the resolver will compute from this margin and MRP at invoice time"
                                    >
                                      → rate ≈ {formatINR(Math.round(basic * 100) / 100)}
                                    </p>
                                  );
                                })()}
                              </>
                            ) : breakup?.effectiveMargin != null ? (
                              <span title={isOverride('marginPercent') ? 'Overridden by price list' : 'From item master'}>
                                {breakup.effectiveMargin}%
                                {isOverride('marginPercent') && (
                                  <span className="ml-1 text-[10px] text-amber-500">*</span>
                                )}
                              </span>
                            ) : item.rate != null ? (
                              <span className="text-zinc-400 text-xs">abs. rate</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {breakup ? formatINR(breakup.basicPrice) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric className="text-zinc-500">
                            {breakup ? (
                              <span title={`GST ${item.itemGstRate ?? 0}%`}>
                                {formatINR(breakup.gstValue)}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {breakup ? formatINR(breakup.landingPrice) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric className="text-zinc-500">
                            {editing ? (
                              <Input
                                type="number"
                                value={editing.discountPercent}
                                onChange={(e) => setDraftField(item.id, 'discountPercent', e.target.value)}
                                placeholder="0"
                                className="w-20 text-right"
                              />
                            ) : item.discountPercent != null ? `${item.discountPercent}%` : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {breakup ? (
                              <span className={profitColor(breakup.profitPerUnit)}>
                                {formatINR(breakup.profitPerUnit)}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric className="text-zinc-500">
                            {editing ? (
                              <Input
                                type="number"
                                value={editing.minQuantity}
                                onChange={(e) => setDraftField(item.id, 'minQuantity', e.target.value)}
                                placeholder="0"
                                className="w-20 text-right"
                              />
                            ) : item.minQuantity ?? 0}
                          </TableCell>
                          <TableCell align="right">
                            <div className="flex items-center justify-end gap-1">
                              {editing ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => saveRow(item)}
                                    loading={saving}
                                    title="Save"
                                  >
                                    <Check size={13} /> Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setCalcRowId(item.id)}
                                    disabled={saving}
                                    title="Open price calculator"
                                    className="text-indigo-500 hover:text-indigo-700"
                                  >
                                    <Calculator size={13} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => cancelEdit(item.id)}
                                    disabled={saving}
                                    title="Cancel"
                                  >
                                    <X size={13} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteRow(item)}
                                    disabled={saving}
                                    title="Remove from list"
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(item)}
                                  title="Edit"
                                >
                                  <Pencil size={13} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {items.length > 0 && (
              <div className="border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                <span className="text-amber-500">*</span> = overridden by this price list (otherwise inherited from item master)
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add item modal — picks an item not already in this price list and
          appends a row with all overrides blank (resolver falls back to the
          item master). The user can immediately Edit the new row to override. */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setAddItemId(''); }}
        title="Add item to price list"
      >
        <div className="space-y-4">
          <Combobox
            label="Item"
            placeholder="Search items…"
            value={addItemId}
            onChange={setAddItemId}
            options={(itemsData?.data ?? [])
              .filter((i) => i.isActive)
              .filter((i) => !items.some((row) => row.itemId === i.id))
              .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); setAddItemId(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={addItem} disabled={!addItemId} loading={update.isPending}>
              <Plus size={13} /> Add
            </Button>
          </div>
        </div>
      </Modal>

      {/* Per-row price calculator. Pre-fills from the active draft so changes
          flow into the same edit session. */}
      {calcRowId && (() => {
        const row = items.find((i) => i.id === calcRowId);
        if (!row) return null;
        const draft = drafts[calcRowId];
        return (
          <PriceCalculatorDialog
            open
            onClose={() => setCalcRowId(null)}
            item={rowToItemMaster(row)}
            currentMargin={draft ? num(draft.marginPercent) : null}
            currentMrp={draft ? num(draft.mrp) : null}
            onApply={(margin, mrp) => {
              setDrafts((d) => ({
                ...d,
                [calcRowId]: {
                  ...(d[calcRowId] ?? {
                    rate: '', mrp: '', marginPercent: '', discountPercent: '', minQuantity: '',
                  }),
                  marginPercent: margin != null ? String(margin) : '',
                  mrp: mrp != null ? String(mrp) : '',
                },
              }));
            }}
          />
        );
      })()}
    </div>
  );
}
