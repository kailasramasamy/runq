import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createSalesInvoiceSchema } from '@runq/validators';
import type { CreateSalesInvoiceInput } from '@runq/validators';
import { useCustomers } from '../../hooks/queries/use-customers';
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
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  hsnSacCode: string;
  taxRate: string;
  taxCategory: string;
}

const EMPTY_LINE: LineItem = { description: '', quantity: '', unitPrice: '', hsnSacCode: '', taxRate: '0', taxCategory: 'taxable' };

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

export function InvoiceForm({ onSubmit, isLoading }: Props) {
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data?.filter((c) => c.isActive) ?? [];

  const [customerId, setCustomerId] = useState('');
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
      items: lines.map((l) => ({
        description: l.description,
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
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Line Items" />
        <CardContent className="p-0 overflow-x-auto">
          {errors.items && (
            <p className="px-4 pt-3 text-xs text-red-600 dark:text-red-400">{errors.items}</p>
          )}
          <Table className="min-w-[900px]">
            <TableHeader>
              <tr>
                <Th className="min-w-[240px]">Description</Th>
                <Th className="min-w-[180px]">HSN/SAC</Th>
                <Th className="min-w-[120px]">Qty</Th>
                <Th className="min-w-[150px]">Unit Price</Th>
                <Th align="right" className="min-w-[100px]">Amount</Th>
                <Th className="min-w-[130px]">Tax Category</Th>
                <Th className="min-w-[90px]">GST Rate</Th>
                <Th className="w-10" />
              </tr>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      placeholder="Description of service or product"
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
          Save Invoice
        </Button>
      </div>
    </form>
  );
}
