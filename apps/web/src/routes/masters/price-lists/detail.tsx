import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Pencil, Power, ArrowLeft, Download } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { usePriceList, useTogglePriceList, type PriceListItemRow } from '@/hooks/queries/use-price-lists';
import { formatINR } from '@/lib/utils';
import { calculatePricing } from '@/lib/item-pricing';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  CardSkeleton, useToast,
} from '@/components/ui';

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

export function PriceListDetailPage({ priceListId }: { priceListId: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  function goBack(): void {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/masters/price-lists' });
  }
  const { data, isLoading, isError } = usePriceList(priceListId);
  const toggle = useTogglePriceList();
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);

  const pl = data?.data ?? null;

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
        <PageHeader
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
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/masters/price-lists' })}>
                <ArrowLeft size={14} /> Back to Price Lists
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = pl.items ?? [];

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
      <PageHeader
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/masters/price-lists/$priceListId/edit', params: { priceListId } })}
            >
              <Pencil size={14} /> Edit
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
          <CardHeader title={`Pricing Breakup (${items.length} items)`} />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Item</Th>
                    <Th>SKU</Th>
                    <Th>Unit</Th>
                    <Th align="right">COGM</Th>
                    <Th align="right">MRP</Th>
                    <Th align="right">Margin %</Th>
                    <Th align="right">Basic Price</Th>
                    <Th align="right">GST</Th>
                    <Th align="right">Landing</Th>
                    <Th align="right">Disc %</Th>
                    <Th align="right">Profit</Th>
                    <Th align="right">Min Qty</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableEmpty colSpan={12} message="No items in this price list." />
                  ) : (
                    items.map((item) => {
                      const breakup = computeBreakup(item);
                      const isOverride = (field: 'mrp' | 'marginPercent') =>
                        item[field] != null;

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
                            {breakup?.effectiveMrp != null ? (
                              <span title={isOverride('mrp') ? 'Overridden by price list' : 'From item master'}>
                                {formatINR(breakup.effectiveMrp)}
                                {isOverride('mrp') && (
                                  <span className="ml-1 text-[10px] text-amber-500">*</span>
                                )}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {breakup?.effectiveMargin != null ? (
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
                            {item.discountPercent != null ? `${item.discountPercent}%` : '—'}
                          </TableCell>
                          <TableCell align="right" numeric>
                            {breakup ? (
                              <span className={profitColor(breakup.profitPerUnit)}>
                                {formatINR(breakup.profitPerUnit)}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right" numeric className="text-zinc-500">
                            {item.minQuantity ?? 0}
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
    </div>
  );
}
