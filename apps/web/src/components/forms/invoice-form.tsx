import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createSalesInvoiceSchema } from '@runq/validators';
import type { CreateSalesInvoiceInput } from '@runq/validators';
import type { SalesInvoiceWithDetails } from '@runq/types';
import { useCustomers } from '../../hooks/queries/use-customers';
import { useItems } from '../../hooks/queries/use-items';
import { resolvePrice, type PriceSource } from '../../hooks/queries/use-price-lists';
import { formatINR } from '../../lib/utils';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  DateInput,
  Select,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Combobox,
  HsnSacCombobox,
} from '@/components/ui';

interface Props {
  onSubmit: (data: CreateSalesInvoiceInput) => void;
  isLoading: boolean;
  initialData?: SalesInvoiceWithDetails;
  submitLabel?: string;
}

interface LineItem {
  itemId: string;
  description: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  hsnSacCode: string;
  taxRate: string;
  taxCategory: string;
  priceSource?: PriceSource;
  priceListName?: string | null;
}

const EMPTY_LINE: LineItem = { itemId: '', description: '', uom: '', quantity: '', unitPrice: '', hsnSacCode: '', taxRate: '0', taxCategory: 'taxable' };

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  customer: 'Customer pricing',
  customer_group: 'Group pricing',
  all: 'Standard pricing',
  item_default: 'Item default',
};

const TAX_RATE_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

const TAX_CATEGORY_OPTIONS = [
  { value: 'taxable', label: 'Taxable' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'nil_rated', label: 'Nil Rated' },
  { value: 'zero_rated', label: 'Zero Rated' },
];

function lineAmount(line: LineItem): number {
  return (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
}

export function InvoiceForm({ onSubmit, isLoading, initialData, submitLabel = 'Save Invoice' }: Props) {
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data?.filter((c) => c.isActive) ?? [];
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems = itemsData?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = allItems.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }));

  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() =>
    initialData ? '' : new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrate state from initialData (used for the edit flow). We wait for the
  // items master to load too so we can auto-link any line whose `description`
  // matches an item by name — this self-heals invoices created before the
  // `item_id` column existed (where description was stored as items.name but
  // the link wasn't persisted). The hydratedRef guard ensures we only run
  // this once per page load so the user's manual edits aren't clobbered.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialData) return;
    if (hydratedRef.current) return;
    // Wait for the items query to settle so name-matching is reliable. Once
    // it has, hydrate exactly once.
    if (itemsData === undefined) return;
    hydratedRef.current = true;

    setCustomerId(initialData.customerId);
    setInvoiceDate(initialData.invoiceDate);
    setDueDate(initialData.dueDate);
    setNotes(initialData.notes ?? '');
    setPoNumber(initialData.poNumber ?? '');

    if (initialData.items.length > 0) {
      // Build a name → item lookup for auto-linking. Case-insensitive +
      // trimmed so " Fresh natural cow milk " matches "Fresh natural cow milk".
      const byName = new Map<string, (typeof allItems)[number]>();
      for (const it of allItems) {
        byName.set(it.name.trim().toLowerCase(), it);
      }

      setLines(initialData.items.map((item) => {
        let itemId = item.itemId ?? '';
        let uom = item.uom ?? '';
        if (!itemId && item.description) {
          const matched = byName.get(item.description.trim().toLowerCase());
          if (matched) {
            itemId = matched.id;
            // Also borrow UOM from the master if the line didn't carry one
            if (!uom && matched.unit) uom = matched.unit;
          }
        }
        return {
          itemId,
          description: item.description,
          uom,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          hsnSacCode: item.hsnSacCode ?? '',
          taxRate: String(item.taxRate ?? 0),
          taxCategory: item.taxCategory ?? 'taxable',
        };
      }));
    }
    // Intentionally exclude allItems/setLines from deps — we want this to fire
    // exactly once when both initialData and the items query are first ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, itemsData]);

  // Auto-compute due date from the selected customer's payment terms.
  // Only fires for new invoices (not edits) — edits preserve the original
  // due date unless the user changes it manually.
  useEffect(() => {
    if (initialData) return;
    if (!customerId) return;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const days = customer.paymentTermsDays ?? 30;
    const base = invoiceDate || new Date().toISOString().slice(0, 10);
    const d = new Date(base + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    setDueDate(d.toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, invoiceDate]);

  // When the customer changes, re-resolve ALL existing line items through
  // the price list so their unit prices reflect the per-customer pricing.
  // Without this, items added before picking a customer (or before switching
  // customers) keep the item-master default instead of the price-list rate.
  const prevCustomerRef = useRef(customerId);
  useEffect(() => {
    if (customerId === prevCustomerRef.current) return;
    prevCustomerRef.current = customerId;
    if (!customerId) return;
    // Re-resolve every line that has an itemId.
    lines.forEach((line, idx) => {
      if (!line.itemId) return;
      const qty = parseFloat(line.quantity || '1') || 1;
      resolvePrice({ customerId, itemId: line.itemId, quantity: qty })
        .then((resolved) => {
          if (resolved) {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      unitPrice: String(resolved.effectiveRate),
                      priceSource: resolved.source,
                      priceListName: resolved.priceListName,
                    }
                  : l,
              ),
            );
          }
        })
        .catch(() => { /* non-fatal */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const tax = lines.reduce((sum, l) => {
    const cat = l.taxCategory;
    if (cat === 'exempt' || cat === 'nil_rated' || cat === 'zero_rated') return sum;
    return sum + lineAmount(l) * (parseFloat(l.taxRate) || 0) / 100;
  }, 0);
  const total = Math.round((subtotal + tax) * 100) / 100;

  const customerOptions = [
    { value: '', label: 'Select customer…' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  function updateLine(idx: number, field: keyof LineItem, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      customerId,
      invoiceDate,
      dueDate,
      subtotal,
      taxAmount: tax,
      totalAmount: total,
      notes: notes || null,
      poNumber: poNumber || null,
      items: lines.map((l) => ({
        itemId: l.itemId || null,
        description: l.description,
        uom: l.uom || null,
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        amount: lineAmount(l),
        hsnSacCode: l.hsnSacCode || null,
        taxRate: parseFloat(l.taxRate) || 0,
        taxCategory: l.taxCategory || 'taxable',
      })),
    };
    const parsed = createSalesInvoiceSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => { errs[err.path.join('.')] = err.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Invoice Info" />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <Combobox
              label="Customer"
              required
              options={customerOptions}
              value={customerId}
              onChange={(value) => setCustomerId(value)}
              placeholder="Search customer…"
              error={errors.customerId}
            />
            <Input
              label="Invoice Number"
              placeholder="Will be auto-generated"
              disabled
              value=""
              onChange={() => undefined}
              helper="Auto-assigned on save"
            />
            <DateInput
              label="Invoice Date"
              required
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              error={errors.invoiceDate}
            />
            <DateInput
              label="Due Date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              error={errors.dueDate}
            />
            <Input
              label="PO Number"
              placeholder="Customer's PO ref (optional)"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              helper="Buyer's PO/order reference. Printed on the invoice."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader title="Line Items" />
        <CardContent className="overflow-visible p-0 md:p-0">
          {errors.items && (
            <p className="px-4 pt-3 text-xs text-red-600 dark:text-red-400">{errors.items}</p>
          )}

          {/* ── Mobile line item cards ── */}
          <div className="flex flex-col gap-3 p-3 md:hidden">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-2">
                  <Combobox
                    label="Item"
                    options={itemOptions}
                    value={line.itemId}
                    onChange={async (itemId) => {
                      const item = allItems.find((i) => i.id === itemId);
                      setLines((prev) => prev.map((l, i) => i === idx ? {
                        ...l,
                        itemId,
                        description: item?.name ?? l.description,
                        uom: item?.unit ?? l.uom,
                        hsnSacCode: item?.hsnSacCode ?? l.hsnSacCode,
                        unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : l.unitPrice,
                        taxRate: item?.gstRate != null ? String(item.gstRate) : l.taxRate,
                        priceSource: undefined,
                        priceListName: null,
                      } : l));
                      if (customerId && itemId) {
                        try {
                          const qty = parseFloat(lines[idx]?.quantity ?? '1') || 1;
                          const resolved = await resolvePrice({ customerId, itemId, quantity: qty });
                          if (resolved) {
                            setLines((prev) => prev.map((l, i) => i === idx ? {
                              ...l,
                              unitPrice: String(resolved.effectiveRate),
                              priceSource: resolved.source,
                              priceListName: resolved.priceListName,
                            } : l));
                          }
                        } catch { /* non-fatal */ }
                      }
                    }}
                    placeholder="Search item…"
                  />
                  {line.priceSource && line.priceSource !== 'item_default' && (
                    <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      {PRICE_SOURCE_LABEL[line.priceSource]}
                      {line.priceListName ? ` · ${line.priceListName}` : ''}
                    </p>
                  )}
                </div>
                <Input
                  label="Description"
                  value={line.description}
                  onChange={(e) => updateLine(idx, 'description', e.target.value)}
                  placeholder="Description"
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Input
                    label="Qty"
                    type="number"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    placeholder="0"
                  />
                  <Input
                    label="Unit Price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                    placeholder="0.00"
                  />
                  <Input
                    label="UOM"
                    value={line.uom}
                    onChange={(e) => updateLine(idx, 'uom', e.target.value)}
                    placeholder="kg, L"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Select
                    label="Tax Category"
                    value={line.taxCategory}
                    onChange={(e) => updateLine(idx, 'taxCategory', e.target.value)}
                    options={TAX_CATEGORY_OPTIONS}
                  />
                  <Select
                    label="GST Rate"
                    value={line.taxRate}
                    onChange={(e) => updateLine(idx, 'taxRate', e.target.value)}
                    options={TAX_RATE_OPTIONS}
                    disabled={line.taxCategory !== 'taxable'}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatINR(lineAmount(line))}
                  </span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeLine(idx)}
                    >
                      <Trash2 size={14} /> Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden md:block">
            <Table noOverflow>
              <TableHeader>
                <tr>
                  <Th className="min-w-[140px]">Item</Th>
                  <Th className="min-w-[120px]">Description</Th>
                  <Th className="min-w-[70px]">UOM</Th>
                  <Th className="min-w-[90px]">HSN/SAC</Th>
                  <Th className="min-w-[55px]">Qty</Th>
                  <Th className="min-w-[75px]">Unit Price</Th>
                  <Th align="right" className="min-w-[80px]">Amount</Th>
                  <Th className="min-w-[115px]">Tax Category</Th>
                  <Th className="min-w-[85px]">GST Rate</Th>
                  <Th className="w-10" />
                </tr>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Combobox
                        options={itemOptions}
                        value={line.itemId}
                        onChange={async (itemId) => {
                          const item = allItems.find((i) => i.id === itemId);
                          setLines((prev) => prev.map((l, i) => i === idx ? {
                            ...l,
                            itemId,
                            description: item?.name ?? l.description,
                            uom: item?.unit ?? l.uom,
                            hsnSacCode: item?.hsnSacCode ?? l.hsnSacCode,
                            unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : l.unitPrice,
                            taxRate: item?.gstRate != null ? String(item.gstRate) : l.taxRate,
                            priceSource: undefined,
                            priceListName: null,
                          } : l));
                          if (customerId && itemId) {
                            try {
                              const qty = parseFloat(lines[idx]?.quantity ?? '1') || 1;
                              const resolved = await resolvePrice({ customerId, itemId, quantity: qty });
                              if (resolved) {
                                setLines((prev) => prev.map((l, i) => i === idx ? {
                                  ...l,
                                  unitPrice: String(resolved.effectiveRate),
                                  priceSource: resolved.source,
                                  priceListName: resolved.priceListName,
                                } : l));
                              }
                            } catch { /* non-fatal */ }
                          }
                        }}
                        placeholder="Search item…"
                      />
                      {line.priceSource && line.priceSource !== 'item_default' && (
                        <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          {PRICE_SOURCE_LABEL[line.priceSource]}
                          {line.priceListName ? ` · ${line.priceListName}` : ''}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        placeholder="Description"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.uom}
                        onChange={(e) => updateLine(idx, 'uom', e.target.value)}
                        placeholder="kg, L, pcs"
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <HsnSacCombobox
                        value={line.hsnSacCode}
                        onChange={(code, gstRate) => {
                          setLines((prev) => prev.map((l, i) => i === idx ? { ...l, hsnSacCode: code, taxRate: gstRate != null ? String(gstRate) : l.taxRate } : l));
                        }}
                        placeholder="Search HSN/SAC…"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Input
                        type="number"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        placeholder="0"
                        className="w-full text-right"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className="w-28 text-right"
                      />
                    </TableCell>
                    <TableCell align="right" numeric>
                      {formatINR(lineAmount(line))}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.taxCategory}
                        onChange={(e) => updateLine(idx, 'taxCategory', e.target.value)}
                        options={TAX_CATEGORY_OPTIONS}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.taxRate}
                        onChange={(e) => updateLine(idx, 'taxRate', e.target.value)}
                        options={TAX_RATE_OPTIONS}
                        disabled={line.taxCategory !== 'taxable'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus size={14} />
            Add Row
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader title="Summary" />
        <CardContent>
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="flex w-56 justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">Subtotal</span>
              <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
            </div>
            <div className="flex w-56 justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">GST (auto-calculated)</span>
              <span className="font-mono tabular-nums">{formatINR(Math.round(tax * 100) / 100)}</span>
            </div>
            <div className="flex w-56 justify-between gap-4 border-t border-zinc-200 pt-2 dark:border-zinc-700">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
              <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this invoice…"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
