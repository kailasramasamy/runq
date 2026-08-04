import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button, Card, CardHeader, CardContent, CardFooter,
  Input, DateInput, Textarea, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { useVendors } from '@/hooks/queries/use-vendors';
import { useVendorCatalog } from '@/hooks/queries/use-vendor-catalog';
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

// A PO commits QUANTITY, not price — the rate is only known once the
// vendor's invoice arrives, so there are no money fields on this form.
interface POLineUI {
  description: string;
  catalogItemId: string;
  uom: string;
  hsnSacCode: string;
  qtyOrdered: string;
}

const EMPTY_LINE: POLineUI = {
  description: '', catalogItemId: '', uom: '', hsnSacCode: '', qtyOrdered: '',
};

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
      label: c.defaultUom ? `${c.description}  ·  ${c.defaultUom}` : c.description,
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
    } : l));
  }

  function updateLine(idx: number, field: keyof POLineUI, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { ...EMPTY_LINE }]); }
  function removeLine(idx: number) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

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
        unitRate: 0,
        amount: 0,
        taxRate: null,
        taxAmount: null,
        notes: null,
      })),
      subtotal: 0,
      taxTotal: 0,
      total: 0,
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
                <Th className="w-[32%]">From catalog (optional)</Th>
                <Th className="w-[28%]">Description</Th>
                <Th align="right" className="w-[12%]">Qty</Th>
                <Th className="w-[12%]">UOM</Th>
                <Th className="w-[13%]">HSN</Th>
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
                  <TableCell>
                    <Input
                      value={line.uom}
                      onChange={(e) => updateLine(idx, 'uom', e.target.value)}
                      placeholder="pcs / kg"
                    />
                  </TableCell>
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
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus size={14} />
            Add line
          </Button>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            No pricing on a PO — rate + tax come from the vendor's invoice at receipt.
          </span>
        </CardFooter>
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
