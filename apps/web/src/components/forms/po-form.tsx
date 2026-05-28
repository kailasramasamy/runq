import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button, Card, CardHeader, CardContent, CardFooter,
  Input, DateInput, Textarea, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useVendors } from '@/hooks/queries/use-vendors';
import { useVendorCatalog } from '@/hooks/queries/use-vendor-catalog';
import { formatINR } from '@/lib/utils';
import {
  createPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from '@runq/validators';

interface Props {
  onSubmit: (data: CreatePurchaseOrderInput) => void;
  initialData?: Partial<CreatePurchaseOrderInput>;
  isLoading: boolean;
  submitLabel?: string;
  editingId?: string;
}

interface POLineUI {
  description: string;
  catalogItemId: string;
  uom: string;
  hsnSacCode: string;
  qtyOrdered: string;
  unitRate: string;
  taxRate: string;
}

const EMPTY_LINE: POLineUI = {
  description: '', catalogItemId: '', uom: '', hsnSacCode: '',
  qtyOrdered: '', unitRate: '', taxRate: '0',
};

function lineAmount(l: POLineUI): number {
  return (parseFloat(l.qtyOrdered) || 0) * (parseFloat(l.unitRate) || 0);
}

export function PoForm({ onSubmit, initialData, isLoading, submitLabel, editingId }: Props) {
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data?.filter((v) => v.isActive) ?? [];
  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  const [vendorId, setVendorId] = useState('');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POLineUI[]>([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // AP Pattern-B Step 7 follow-up: catalog combobox on PO line description.
  // Pulled here because PP is the natural home for it.
  const { data: catalogRes } = useVendorCatalog(vendorId);
  const catalogRows = catalogRes?.data ?? [];
  const catalogOptions = [
    { value: '', label: 'Free text…' },
    ...catalogRows.map((c) => ({
      value: c.id,
      label: c.defaultRate
        ? `${c.description}  ·  ₹${Number(c.defaultRate).toLocaleString('en-IN')}`
        : c.description,
    })),
  ];

  useEffect(() => {
    if (!initialData) return;
    if (initialData.vendorId) setVendorId(initialData.vendorId);
    if (initialData.poDate) setPoDate(initialData.poDate);
    if (initialData.expectedDate) setExpectedDate(initialData.expectedDate);
    if (initialData.paymentTerms) setPaymentTerms(initialData.paymentTerms);
    if (initialData.deliveryAddress) setDeliveryAddress(initialData.deliveryAddress);
    if (initialData.notes) setNotes(initialData.notes);
    if (initialData.lines?.length) {
      setLines(initialData.lines.map((l) => ({
        description: l.description ?? '',
        catalogItemId: l.catalogItemId ?? '',
        uom: l.uom ?? '',
        hsnSacCode: l.hsnSacCode ?? '',
        qtyOrdered: String(l.qtyOrdered ?? ''),
        unitRate: String(l.unitRate ?? ''),
        taxRate: String(l.taxRate ?? 0),
      })));
    }
  }, [initialData]);

  function pickCatalog(idx: number, catalogItemId: string) {
    if (!catalogItemId) {
      setLines((prev) => prev.map((l, i) => i === idx ? { ...l, catalogItemId: '' } : l));
      return;
    }
    const entry = catalogRows.find((c) => c.id === catalogItemId);
    if (!entry) return;
    setLines((prev) => prev.map((l, i) => i === idx ? {
      ...l,
      catalogItemId,
      description: entry.description,
      uom: entry.defaultUom ?? l.uom,
      hsnSacCode: entry.hsnSacCode ?? l.hsnSacCode,
      unitRate: entry.defaultRate ?? l.unitRate,
      taxRate: entry.defaultTaxRate ?? l.taxRate,
    } : l));
  }

  function updateLine(idx: number, field: keyof POLineUI, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { ...EMPTY_LINE }]); }
  function removeLine(idx: number) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const taxTotal = lines.reduce((s, l) => s + lineAmount(l) * (parseFloat(l.taxRate) || 0) / 100, 0);
  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreatePurchaseOrderInput = {
      vendorId,
      poDate,
      expectedDate: expectedDate || null,
      paymentTerms: paymentTerms || null,
      deliveryAddress: deliveryAddress || null,
      notes: notes || null,
      lines: lines.map((l) => ({
        description: l.description,
        catalogItemId: l.catalogItemId || null,
        uom: l.uom || null,
        hsnSacCode: l.hsnSacCode || null,
        qtyOrdered: parseFloat(l.qtyOrdered) || 0,
        unitRate: parseFloat(l.unitRate) || 0,
        amount: lineAmount(l),
        taxRate: parseFloat(l.taxRate) || 0,
        taxAmount: Math.round(lineAmount(l) * (parseFloat(l.taxRate) || 0)) / 100,
        notes: null,
      })),
      subtotal,
      taxTotal: Math.round(taxTotal * 100) / 100,
      total,
    };
    const parsed = createPurchaseOrderSchema.safeParse(payload);
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
        <CardHeader title="PO Info" />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
            <Combobox
              label="Vendor" required
              options={vendorOptions}
              value={vendorId}
              onChange={(v) => setVendorId(v)}
              placeholder="Search vendor…"
              error={errors.vendorId}
            />
            <DateInput
              label="PO Date" required
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              error={errors.poDate}
            />
            <DateInput
              label="Expected Delivery"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
            <Input
              label="Payment terms"
              placeholder="Net 30"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
            <Textarea
              label="Delivery address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Optional…"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader title="Line items" />
        <CardContent className="p-0 overflow-visible">
          {errors.lines && (
            <p className="px-4 pt-3 text-xs text-red-600 dark:text-red-400">{errors.lines}</p>
          )}
          <Table noOverflow>
            <TableHeader>
              <tr>
                <Th className="w-[28%]">From catalog (optional)</Th>
                <Th className="w-[22%]">Description</Th>
                <Th align="right" className="w-[8%]">Qty</Th>
                <Th align="right" className="w-[10%]">Rate</Th>
                <Th align="right" className="w-[8%]">Tax %</Th>
                <Th align="right" className="w-[12%]">Amount</Th>
                <Th className="w-[8%]">HSN</Th>
                <Th className="w-[3%]" />
              </tr>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Combobox
                      options={catalogOptions}
                      value={line.catalogItemId}
                      onChange={(v) => pickCatalog(idx, v)}
                      placeholder={vendorId ? 'Pick or type below…' : 'Pick a vendor first'}
                      disabled={!vendorId}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      placeholder="Free text…"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number" min="0" step="0.001"
                      value={line.qtyOrdered}
                      onChange={(e) => updateLine(idx, 'qtyOrdered', e.target.value)}
                      placeholder="0" className="text-right"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number" min="0" step="0.01"
                      value={line.unitRate}
                      onChange={(e) => updateLine(idx, 'unitRate', e.target.value)}
                      placeholder="0.00" className="text-right"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number" min="0" max="100" step="0.01"
                      value={line.taxRate}
                      onChange={(e) => updateLine(idx, 'taxRate', e.target.value)}
                      placeholder="0" className="text-right"
                    />
                  </TableCell>
                  <TableCell align="right" numeric>{formatINR(lineAmount(line))}</TableCell>
                  <TableCell>
                    <Input
                      value={line.hsnSacCode}
                      onChange={(e) => updateLine(idx, 'hsnSacCode', e.target.value)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {lines.length > 1 && (
                      <Button
                        type="button" variant="ghost" size="sm"
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
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus size={14} />
            Add line
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader title="Totals" />
        <CardContent>
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="flex w-56 justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">Subtotal</span>
              <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
            </div>
            <div className="flex w-56 justify-between gap-4">
              <span className="text-zinc-500 dark:text-zinc-400">Tax</span>
              <span className="font-mono tabular-nums">{formatINR(Math.round(taxTotal * 100) / 100)}</span>
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
            placeholder="Internal notes (won't print on the PO)…"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={isLoading}>
          {submitLabel ?? (editingId ? 'Save changes' : 'Save PO')}
        </Button>
      </div>
    </form>
  );
}
