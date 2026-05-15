import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, X, Pencil, Download, Trash2, Calculator, Search } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, DateInput,
  Combobox, Modal, Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { calculatePricing, solveMrpForTargetMargin } from '@/lib/item-pricing';
import {
  usePriceLists, useCreatePriceList, useUpdatePriceList,
  type PriceList, type CreatePriceListInput, type PriceListItemInput,
} from '@/hooks/queries/use-price-lists';
import { useItems, type Item } from '@/hooks/queries/use-items';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useVendors } from '@/hooks/queries/use-vendors';
import { ApiClientError } from '@/lib/api-client';

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

function applyToLabel(applyTo: string, value: string | null, customerName?: string | null, vendorName?: string | null) {
  switch (applyTo) {
    case 'all': return 'All';
    case 'customer_group': return `Customers: ${value}`;
    case 'vendor_group': return `Vendors: ${value}`;
    case 'customer': return `Customer: ${customerName ?? value}`;
    case 'vendor': return `Vendor: ${vendorName ?? value}`;
    default: return applyTo;
  }
}

// ─── Price Calculator Dialog ────────────────────────────────────────────────

function CalcStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`font-mono text-sm font-semibold ${className ?? 'text-zinc-900 dark:text-zinc-100'}`}>{value}</p>
    </div>
  );
}

/**
 * Per-row pricing calculator. Uses the items-master MRP-anchored flow to
 * show standard data + net profit, and when the user changes the seller
 * margin %, suggests an MRP that maintains the standard net margin %.
 *
 * Only meaningful for products. For services, the resolver path doesn't run
 * the MRP chain, so the calculator is hidden in the row.
 */
export function PriceCalculatorDialog({
  open,
  onClose,
  item,
  currentMargin,
  currentMrp,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
  currentMargin: number | null;
  currentMrp: number | null;
  onApply: (margin: number | null, mrp: number | null) => void;
}) {
  const [marginInput, setMarginInput] = useState<string>('');
  const [mrpInput, setMrpInput] = useState<string>('');

  // Reset the editable fields each time the dialog opens for a (possibly
  // different) row.
  useEffect(() => {
    if (open) {
      setMarginInput(currentMargin != null ? String(currentMargin) : '');
      setMrpInput(currentMrp != null ? String(currentMrp) : '');
    }
  }, [open, currentMargin, currentMrp]);

  const cogm = item.costPrice ?? 0;
  const gst = item.gstRate ?? 0;
  const standardMrp = item.mrp;
  const standardMargin = item.margin;

  // Standard pricing baseline from the item master.
  const standard = useMemo(() => {
    if (standardMrp == null || standardMargin == null) return null;
    return calculatePricing({
      mrp: standardMrp,
      sellerMarginPct: standardMargin,
      gstRatePct: gst,
      cogm,
    });
  }, [standardMrp, standardMargin, gst, cogm]);

  // Effective override values fall back to standard when the input is blank
  // — that way the override panel always renders something coherent.
  const effectiveMargin = marginInput !== '' ? Number(marginInput) : standardMargin;
  const effectiveMrp = mrpInput !== '' ? Number(mrpInput) : standardMrp;
  const override = useMemo(() => {
    if (effectiveMrp == null || effectiveMargin == null) return null;
    return calculatePricing({
      mrp: effectiveMrp,
      sellerMarginPct: effectiveMargin,
      gstRatePct: gst,
      cogm,
    });
  }, [effectiveMrp, effectiveMargin, gst, cogm]);

  // Suggested MRP: the price that would still hit the standard net margin %
  // at the user's chosen seller margin %. Hidden when no margin change.
  const suggestedMrp = useMemo(() => {
    if (!standard || effectiveMargin == null) return null;
    if (effectiveMargin === standardMargin) return null;
    return solveMrpForTargetMargin(cogm, effectiveMargin, gst, standard.netMarginPct);
  }, [standard, effectiveMargin, standardMargin, cogm, gst]);

  function handleApply() {
    onApply(
      marginInput !== '' ? Number(marginInput) : null,
      mrpInput !== '' ? Number(mrpInput) : null,
    );
    onClose();
  }

  function useSuggestedMrp() {
    if (suggestedMrp != null) setMrpInput(String(suggestedMrp));
  }

  const profitTone = (profit: number, netMargin: number) =>
    profit < 0
      ? 'text-red-700 dark:text-red-400'
      : netMargin < 5
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-emerald-700 dark:text-emerald-400';

  return (
    <Modal open={open} onClose={onClose} title={`Price Calculator — ${item.name}`} wide>
      <div className="space-y-4">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.sku && <span>SKU: {item.sku}</span>}
          {item.sku && item.unit && <span> · </span>}
          {item.unit && <span>Unit: {item.unit}</span>}
        </div>

        {/* Standard (item master) */}
        <fieldset className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Standard (item master)
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CalcStat label="COGM" value={item.costPrice != null ? formatINR(item.costPrice) : '—'} />
            <CalcStat label="GST" value={`${gst}%`} />
            <CalcStat label="MRP" value={standardMrp != null ? formatINR(standardMrp) : '—'} />
            <CalcStat label="Seller Margin" value={standardMargin != null ? `${standardMargin}%` : '—'} />
          </div>
          {standard ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CalcStat label="Basic Price" value={formatINR(standard.basicPrice)} />
              <CalcStat label="Landing" value={formatINR(standard.landingPrice)} />
              <CalcStat
                label="Profit / unit"
                value={formatINR(standard.profitPerUnit)}
                className={profitTone(standard.profitPerUnit, standard.netMarginPct)}
              />
              <CalcStat
                label="Net Margin"
                value={`${standard.netMarginPct.toFixed(2)}%`}
                className={profitTone(standard.profitPerUnit, standard.netMarginPct)}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Item master is missing MRP, seller margin, or COGM — can't compute the standard.
            </p>
          )}
        </fieldset>

        {/* Customer override */}
        <fieldset className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Customer override
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Seller Margin (%)</label>
              <input
                type="number"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                placeholder={standardMargin != null ? String(standardMargin) : '—'}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">MRP</label>
              <input
                type="number"
                value={mrpInput}
                onChange={(e) => setMrpInput(e.target.value)}
                placeholder={standardMrp != null ? String(standardMrp) : '—'}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              {suggestedMrp != null && standard && (
                <button
                  type="button"
                  onClick={useSuggestedMrp}
                  className="mt-1 text-left text-[10px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  ↳ Use {formatINR(suggestedMrp)} to hold standard net margin {standard.netMarginPct.toFixed(2)}%
                </button>
              )}
            </div>
          </div>
          {override ? (
            <div
              className={`grid grid-cols-2 gap-2 rounded-md border px-2 py-2 sm:grid-cols-4 ${
                override.profitPerUnit < 0
                  ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                  : override.netMarginPct < 5
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
              }`}
            >
              <CalcStat label="Basic Price" value={formatINR(override.basicPrice)} />
              <CalcStat label="Landing" value={formatINR(override.landingPrice)} />
              <CalcStat
                label="Profit / unit"
                value={formatINR(override.profitPerUnit)}
                className={profitTone(override.profitPerUnit, override.netMarginPct)}
              />
              <CalcStat
                label="Net Margin"
                value={`${override.netMarginPct.toFixed(2)}%`}
                className={profitTone(override.profitPerUnit, override.netMarginPct)}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Enter both margin and MRP (or leave blank to inherit standard) to see the result.
            </p>
          )}
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={handleApply}>Apply to row</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Line Item Row ──────────────────────────────────────────────────────────

interface LineItemProps {
  line: PriceListItemInput & { _key: string };
  items: Item[];
  onChange: (key: string, updates: Partial<PriceListItemInput>) => void;
  onRemove: (key: string) => void;
  onOpenCalc: () => void;
}

const numericInputClasses =
  'w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

function LineItemRow({ line, items, onChange, onRemove, onOpenCalc }: LineItemProps) {
  const selectedItem = items.find((i) => i.id === line.itemId);
  const itemOptions = items
    .filter((i) => i.isActive)
    .map((i) => ({
      value: i.id,
      label: `${i.name}${i.sku ? ` (${i.sku})` : ''}${i.unit ? ` · ${i.unit}` : ''}`,
    }));

  // Items-master basic price (per unit, excluding GST). This is what the
  // resolver returns as the rate, so both the Rate placeholder and the
  // override preview should reference it for consistency.
  function basicFromMaster(): number | null {
    if (!selectedItem) return null;
    if (selectedItem.basicPrice != null) return selectedItem.basicPrice;
    if (selectedItem.defaultSellingPrice != null) {
      const gst = selectedItem.gstRate ?? 0;
      return Math.round((selectedItem.defaultSellingPrice / (1 + gst / 100)) * 100) / 100;
    }
    return null;
  }

  const ratePlaceholder = (() => {
    const b = basicFromMaster();
    return b != null ? String(b) : '0.00';
  })();

  // Live preview of the basic price the resolver will use at invoice time,
  // computed from the items-master MRP-anchored flow:
  //     basicPrice = effectiveMrp × (1 - margin/100) / (1 + gst/100)
  // Only shown when rate is blank but we have enough inputs to compute it.
  const marginPreview = (() => {
    if (line.rate != null || !selectedItem) return null;
    const effectiveMrp = line.mrp ?? selectedItem.mrp;
    const effectiveMargin = line.marginPercent ?? selectedItem.margin;
    if (effectiveMrp == null || effectiveMargin == null) return null;
    const gst = selectedItem.gstRate ?? 0;
    const landing = effectiveMrp * (1 - effectiveMargin / 100);
    const basic = landing / (1 + gst / 100);
    return Math.round(basic * 100) / 100;
  })();

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800 align-top">
      <td className="px-3 py-2">
        <Combobox
          options={itemOptions}
          value={line.itemId}
          onChange={(value) => onChange(line._key, { itemId: value })}
          placeholder="Search item…"
        />
      </td>
      <td className="px-3 py-2 text-xs text-zinc-500">{selectedItem?.sku ?? '-'}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.rate ?? ''}
          onChange={(e) => onChange(line._key, { rate: e.target.value ? Number(e.target.value) : null })}
          className={numericInputClasses}
          placeholder={ratePlaceholder}
          title="Basic price per unit (excludes GST). Leave blank to derive from MRP × (1 - margin) / (1 + gst)."
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.marginPercent ?? ''}
          onChange={(e) => onChange(line._key, { marginPercent: e.target.value ? Number(e.target.value) : null })}
          className={numericInputClasses}
          placeholder="%"
        />
        {marginPreview != null && (
          <p
            className="mt-1 text-right text-[10px] text-emerald-600 dark:text-emerald-400"
            title="Basic price the resolver will compute from this margin and MRP at invoice time"
          >
            → rate ≈ {formatINR(marginPreview)}
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.mrp ?? ''}
          onChange={(e) => onChange(line._key, { mrp: e.target.value ? Number(e.target.value) : null })}
          className={numericInputClasses}
          placeholder={selectedItem?.mrp != null ? String(selectedItem.mrp) : '0.00'}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.discountPercent ?? ''}
          onChange={(e) => onChange(line._key, { discountPercent: e.target.value ? Number(e.target.value) : null })}
          className={numericInputClasses}
          placeholder="%"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.minQuantity ?? ''}
          onChange={(e) => onChange(line._key, { minQuantity: e.target.value ? Number(e.target.value) : null })}
          className={numericInputClasses}
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          {/* Calculator: visible by default so users discover it, disabled
              until an item is picked. Hidden entirely for services since the
              MRP-anchored math doesn't apply. */}
          {(!selectedItem || selectedItem.type === 'product') && (
            <button
              type="button"
              onClick={selectedItem ? onOpenCalc : undefined}
              disabled={!selectedItem}
              title={selectedItem ? 'Open price calculator' : 'Select an item first'}
              className={`rounded p-1 ${
                selectedItem
                  ? 'text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950'
                  : 'cursor-not-allowed text-zinc-300 dark:text-zinc-700'
              }`}
            >
              <Calculator size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(line._key)}
            title="Remove line"
            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Create / Edit Form ─────────────────────────────────────────────────────

type LineWithKey = PriceListItemInput & { _key: string };
let lineKeyCounter = 0;
function newLineKey() { return `line-${++lineKeyCounter}`; }

export function PriceListForm({ priceList, onClose }: { priceList?: PriceList; onClose: () => void }) {
  const create = useCreatePriceList();
  const update = useUpdatePriceList();
  const { toast } = useToast();
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems = itemsData?.data ?? [];
  const { data: customersData } = useCustomers({ limit: 200 });
  const customerOpts = useMemo(() => {
    const list = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
    // Ensure the current customer shows by name even before the full list loads
    if (priceList?.customerId && priceList.customerName && !list.some((o) => o.value === priceList.customerId)) {
      list.unshift({ value: priceList.customerId, label: priceList.customerName });
    }
    return list;
  }, [customersData, priceList?.customerId, priceList?.customerName]);
  const { data: vendorsData } = useVendors({ limit: 200 });
  const vendorOpts = useMemo(() => {
    const list = (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }));
    if (priceList?.vendorId && priceList.vendorName && !list.some((o) => o.value === priceList.vendorId)) {
      list.unshift({ value: priceList.vendorId, label: priceList.vendorName });
    }
    return list;
  }, [vendorsData, priceList?.vendorId, priceList?.vendorName]);
  const isEdit = !!priceList;

  const [name, setName] = useState(priceList?.name ?? '');
  const [type, setType] = useState<'selling' | 'buying'>(priceList?.type ?? 'selling');
  const [currency, setCurrency] = useState(priceList?.currency ?? 'INR');
  const [applyTo, setApplyTo] = useState(priceList?.applyTo ?? 'all');
  const [applyToValue, setApplyToValue] = useState(priceList?.applyToValue ?? '');
  const [customerId, setCustomerId] = useState(priceList?.customerId ?? '');
  const [vendorId, setVendorId] = useState(priceList?.vendorId ?? '');
  const [validFrom, setValidFrom] = useState(priceList?.validFrom ?? '');
  const [validTo, setValidTo] = useState(priceList?.validTo ?? '');
  const [lines, setLines] = useState<LineWithKey[]>(() =>
    priceList?.items?.length
      ? priceList.items.map((li) => ({
          _key: newLineKey(),
          itemId: li.itemId,
          rate: li.rate,
          marginPercent: li.marginPercent,
          mrp: li.mrp,
          discountPercent: li.discountPercent,
          minQuantity: li.minQuantity,
        }))
      : [{ _key: newLineKey(), itemId: '', rate: null, marginPercent: null, mrp: null, discountPercent: null, minQuantity: null }],
  );

  // Per-row price calculator dialog state. Lifted up here because Modal
  // can't render inside a <tbody> (HTML constraint), so each row just signals
  // which line should open the calculator.
  const [calcRowKey, setCalcRowKey] = useState<string | null>(null);
  const calcLine = calcRowKey ? lines.find((l) => l._key === calcRowKey) ?? null : null;
  const calcItem = calcLine ? allItems.find((i) => i.id === calcLine.itemId) ?? null : null;

  function addLine() {
    setLines((prev) => [...prev, { _key: newLineKey(), itemId: '', rate: null, marginPercent: null, mrp: null, discountPercent: null, minQuantity: null }]);
  }

  function updateLine(key: string, updates: Partial<PriceListItemInput>) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...updates } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) {
      toast('Add at least one item', 'error');
      return;
    }
    // Use the row's position in the user-visible list (1-indexed) so the error
    // toast points to the actual row that needs fixing, not the index in the
    // post-filter array.
    const incompleteIdx = lines.findIndex(
      (l) => l.itemId && l.rate == null && l.marginPercent == null && l.mrp == null,
    );
    if (incompleteIdx !== -1) {
      toast(`Row ${incompleteIdx + 1}: set at least one of rate, margin %, or MRP`, 'error');
      return;
    }

    const data: CreatePriceListInput = {
      name,
      type,
      currency,
      applyTo,
      ...(applyTo === 'customer_group' || applyTo === 'vendor_group' ? { applyToValue } : {}),
      ...(applyTo === 'customer' && customerId ? { customerId } : {}),
      ...(applyTo === 'vendor' && vendorId ? { vendorId } : {}),
      ...(validFrom ? { validFrom } : {}),
      ...(validTo ? { validTo } : {}),
      items: validLines.map(({ _key, ...rest }) => rest),
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: priceList.id, data });
        toast('Price list updated', 'success');
      } else {
        await create.mutateAsync(data);
        toast('Price list created', 'success');
      }
      onClose();
    } catch (err) {
      // Translate server-side validation errors into a row-specific message
      // (e.g. items.5.rate → Row 6) so users can fix the bad row without
      // having to open DevTools.
      if (err instanceof ApiClientError && err.details && err.details.length > 0) {
        const first = err.details[0];
        const m = /^items\.(\d+)\./.exec(first.field);
        const rowLabel = m ? `Row ${Number(m[1]) + 1}: ` : '';
        toast(`${rowLabel}${first.message}`, 'error');
      } else {
        toast(`Failed to ${isEdit ? 'update' : 'create'} price list`, 'error');
      }
    }
  }

  const borderColor = isEdit
    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
    : 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20';

  return (
    <div className={`mb-4 max-w-5xl rounded-lg border p-4 ${borderColor}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {isEdit ? `Edit — ${priceList.name}` : 'New Price List'}
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Wholesale Rates" />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'selling' | 'buying')} options={[{ value: 'selling', label: 'Selling' }, { value: 'buying', label: 'Buying' }]} />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="INR" />
          <Select
            label="Apply To"
            value={applyTo}
            onChange={(e) => setApplyTo(e.target.value as 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'customer_group', label: 'Customer Group' },
              { value: 'vendor_group', label: 'Vendor Group' },
              { value: 'customer', label: 'Specific Customer' },
              { value: 'vendor', label: 'Specific Vendor' },
            ]}
          />
        </div>

        {(applyTo === 'customer_group' || applyTo === 'vendor_group') && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input label="Group Name" value={applyToValue} onChange={(e) => setApplyToValue(e.target.value)} required placeholder="e.g. Wholesale, Retail" />
          </div>
        )}
        {applyTo === 'customer' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Combobox
              label="Customer"
              options={customerOpts}
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              placeholder="Search customer…"
              required
            />
          </div>
        )}
        {applyTo === 'vendor' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Combobox
              label="Vendor"
              options={vendorOpts}
              value={vendorId}
              onChange={(v) => setVendorId(v)}
              placeholder="Search vendor…"
              required
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <DateInput label="Valid From" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          <DateInput label="Valid To" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2">
            <h5 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Items</h5>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Override Rate (absolute), Seller Margin %, or MRP — any combination. Click the calculator on any product row to see the items-master breakdown and a suggested MRP.
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Item</th>
                  <th className="w-20 px-3 py-2 text-left text-xs font-medium text-zinc-500">SKU</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-zinc-500">Rate</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-zinc-500">Margin%</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-zinc-500">MRP</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-zinc-500">Discount%</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-zinc-500">Min Qty</th>
                  <th className="w-16 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <LineItemRow
                    key={line._key}
                    line={line}
                    items={allItems}
                    onChange={updateLine}
                    onRemove={removeLine}
                    onOpenCalc={() => setCalcRowKey(line._key)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus size={14} /> Add Item
            </Button>
          </div>
        </div>

        {calcLine && calcItem && (
          <PriceCalculatorDialog
            open={true}
            onClose={() => setCalcRowKey(null)}
            item={calcItem}
            currentMargin={calcLine.marginPercent ?? null}
            currentMrp={calcLine.mrp ?? null}
            onApply={(margin, mrp) => updateLine(calcLine._key, { marginPercent: margin, mrp })}
          />
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending || update.isPending} size="sm">
            {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Price List</>}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Price Lists Page ───────────────────────────────────────────────────────

export function PriceListsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'' | 'selling' | 'buying'>('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'inactive'>('');
  const { data, isLoading } = usePriceLists({
    ...(search ? { search } : {}),
    ...(filterType ? { type: filterType } : {}),
  });
  const [showCreate, setShowCreate] = useState(false);

  const allPriceLists = data?.data ?? [];
  const priceLists = filterStatus
    ? allPriceLists.filter((pl) => (filterStatus === 'active' ? pl.isActive : !pl.isActive))
    : allPriceLists;

  function openDetail(id: string) {
    navigate({ to: '/finance/masters/price-lists/$priceListId', params: { priceListId: id } });
  }

  return (
    <div>
      <PageHeader fullWidth
        title="Price Lists"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Price Lists' }]}
        description="Manage selling and buying price lists for different customer/vendor groups."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('price-lists.csv', ['Name', 'Type', 'Currency', 'Apply To', 'Valid From', 'Valid To', 'Items', 'Status'], priceLists.map(p => [p.name, p.type, p.currency, p.applyTo, p.validFrom ?? '', p.validTo ?? '', String(p.itemCount ?? 0), p.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} /> New Price List
            </Button>
          </div>
        }
      />

      {showCreate && <PriceListForm onClose={() => setShowCreate(false)} />}

      {/* Search & Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative sm:w-72">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute mt-[-30px] ml-3 text-zinc-400" />
        </div>
        <div className="w-36">
          <Combobox
            options={[
              { value: '', label: 'All Types' },
              { value: 'selling', label: 'Selling' },
              { value: 'buying', label: 'Buying' },
            ]}
            value={filterType}
            onChange={(v) => setFilterType(v as '' | 'selling' | 'buying')}
            placeholder="Type"
          />
        </div>
        <div className="w-36">
          <Combobox
            options={[
              { value: '', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as '' | 'active' | 'inactive')}
            placeholder="Status"
          />
        </div>
      </div>

      {/* Mobile cards */}
      {isLoading ? (
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : priceLists.length === 0 ? (
        <div className="md:hidden py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {search || filterType || filterStatus ? 'No price lists match your filters.' : 'No price lists yet. Create your first price list above.'}
        </div>
      ) : (
        <div className="space-y-2 md:hidden">
          {priceLists.map((pl) => (
            <div
              key={pl.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => openDetail(pl.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{pl.name}</p>
                <div className="flex gap-1 shrink-0">
                  <Badge variant={pl.type === 'selling' ? 'success' : 'info'}>{pl.type}</Badge>
                  <Badge variant={statusVariant(pl.isActive)}>{pl.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{applyToLabel(pl.applyTo, pl.applyToValue, pl.customerName, pl.vendorName)}</span>
                <span>{pl.itemCount ?? 0} items</span>
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
                <Th>Type</Th>
                <Th>Currency</Th>
                <Th>Apply To</Th>
                <Th>Valid From</Th>
                <Th>Valid To</Th>
                <Th align="right">Items</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={9} />
              ) : priceLists.length === 0 ? (
                <TableEmpty colSpan={9} message={search || filterType || filterStatus ? 'No price lists match your filters.' : 'No price lists yet. Create your first price list above.'} />
              ) : (
                priceLists.map((pl) => (
                  <TableRow key={pl.id} className="cursor-pointer" onClick={() => openDetail(pl.id)}>
                    <TableCell className="font-medium">{pl.name}</TableCell>
                    <TableCell><Badge variant={pl.type === 'selling' ? 'success' : 'info'}>{pl.type}</Badge></TableCell>
                    <TableCell>{pl.currency}</TableCell>
                    <TableCell className="text-zinc-500">{applyToLabel(pl.applyTo, pl.applyToValue, pl.customerName, pl.vendorName)}</TableCell>
                    <TableCell className="text-zinc-500">{pl.validFrom ?? '-'}</TableCell>
                    <TableCell className="text-zinc-500">{pl.validTo ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{pl.itemCount ?? 0}</TableCell>
                    <TableCell><Badge variant={statusVariant(pl.isActive)}>{pl.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell align="right">—</TableCell>
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
