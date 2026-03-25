import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createPurchaseInvoiceSchema } from '@runq/validators';
import type { CreatePurchaseInvoiceInput } from '@runq/validators';
import { useVendors } from '../../hooks/queries/use-vendors';
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
  onSubmit: (data: CreatePurchaseInvoiceInput) => void;
  isLoading: boolean;
}

interface LineItem {
  itemName: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  hsnSacCode: string;
  taxRate: string;
  taxCategory: string;
  tdsSection: string;
  tdsRate: string;
}

const EMPTY_LINE: LineItem = {
  itemName: '', sku: '', quantity: '', unitPrice: '',
  hsnSacCode: '', taxRate: '0', taxCategory: 'taxable',
  tdsSection: '', tdsRate: '0',
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
  { value: 'reverse_charge', label: 'Reverse Charge' },
];

const TDS_SECTION_OPTIONS = [
  { value: '', label: 'None' },
  { value: '194C', label: '194C — Contractor (1%/2%)' },
  { value: '194J', label: '194J — Professional/Technical (10%)' },
  { value: '194H', label: '194H — Commission (5%)' },
  { value: '194I', label: '194I — Rent (10%)' },
  { value: '194A', label: '194A — Interest (10%)' },
  { value: '194Q', label: '194Q — Purchase of Goods (0.1%)' },
];

function lineAmount(line: LineItem): number {
  return (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
}

export function BillForm({ onSubmit, isLoading }: Props) {
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data?.filter((v) => v.isActive) ?? [];

  const [vendorId, setVendorId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const tax = lines.reduce((sum, l) => {
    const cat = l.taxCategory;
    if (cat === 'exempt' || cat === 'nil_rated' || cat === 'zero_rated') return sum;
    return sum + lineAmount(l) * (parseFloat(l.taxRate) || 0) / 100;
  }, 0);
  const tdsTotal = lines.reduce((sum, l) => sum + lineAmount(l) * (parseFloat(l.tdsRate) || 0) / 100, 0);
  const total = Math.round((subtotal + tax) * 100) / 100;

  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
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
      vendorId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      subtotal,
      taxAmount: Math.round(tax * 100) / 100,
      totalAmount: total,
      notes: notes || null,
      items: lines.map((l) => ({
        itemName: l.itemName,
        sku: l.sku || null,
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        amount: lineAmount(l),
        hsnSacCode: l.hsnSacCode || null,
        taxRate: parseFloat(l.taxRate) || 0,
        taxCategory: l.taxCategory || 'taxable',
        tdsSection: l.tdsSection || null,
        tdsRate: parseFloat(l.tdsRate) || null,
      })),
    };
    const parsed = createPurchaseInvoiceSchema.safeParse(payload);
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
        <CardHeader title="Bill Info" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Combobox
                label="Vendor"
                required
                options={vendorOptions}
                value={vendorId}
                onChange={(value) => setVendorId(value)}
                placeholder="Search vendor…"
                error={errors.vendorId}
              />
            </div>
            <Input
              label="Invoice Number"
              required
              placeholder="INV-2024-001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              error={errors.invoiceNumber}
            />
            <div />
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Line Items" />
        <CardContent className="p-0">
          {errors.items && (
            <p className="px-4 pt-3 text-xs text-red-600 dark:text-red-400">{errors.items}</p>
          )}
          <Table>
            <TableHeader>
              <tr>
                <Th>Item Name</Th>
                <Th>HSN/SAC</Th>
                <Th>SKU</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit Price</Th>
                <Th align="right">Amount</Th>
                <Th>Tax Category</Th>
                <Th>GST Rate</Th>
                <Th>TDS Section</Th>
                <Th>TDS %</Th>
                <Th />
              </tr>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={line.itemName}
                      onChange={(e) => updateLine(idx, 'itemName', e.target.value)}
                      placeholder="Item name"
                    />
                  </TableCell>
                  <TableCell>
                    <HsnSacCombobox
                      value={line.hsnSacCode}
                      onChange={(code, gstRate) => {
                        setLines((prev) => prev.map((l, i) => i === idx ? { ...l, hsnSacCode: code, taxRate: gstRate != null ? String(gstRate) : l.taxRate } : l));
                      }}
                      placeholder="Code…"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.sku}
                      onChange={(e) => updateLine(idx, 'sku', e.target.value)}
                      placeholder="SKU"
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number" min="0"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      placeholder="0" className="w-20 text-right"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number" min="0" step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                      placeholder="0.00" className="w-28 text-right"
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
                      disabled={line.taxCategory !== 'taxable' && line.taxCategory !== 'reverse_charge'}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={line.tdsSection}
                      onChange={(e) => updateLine(idx, 'tdsSection', e.target.value)}
                      options={TDS_SECTION_OPTIONS}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min="0" max="100" step="0.1"
                      value={line.tdsRate}
                      onChange={(e) => updateLine(idx, 'tdsRate', e.target.value)}
                      placeholder="0" className="w-16 text-right"
                      disabled={!line.tdsSection}
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
            {tdsTotal > 0 && (
              <div className="flex w-56 justify-between gap-4">
                <span className="text-zinc-500 dark:text-zinc-400">TDS deductible</span>
                <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  -{formatINR(Math.round(tdsTotal * 100) / 100)}
                </span>
              </div>
            )}
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
            placeholder="Optional notes…"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={isLoading}>
          Save Bill
        </Button>
      </div>
    </form>
  );
}
