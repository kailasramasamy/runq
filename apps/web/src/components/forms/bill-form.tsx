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
  Select,
  DateInput,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
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
}

const EMPTY_LINE: LineItem = { itemName: '', sku: '', quantity: '', unitPrice: '' };

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
  const [taxAmount, setTaxAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const tax = parseFloat(taxAmount) || 0;
  const total = subtotal + tax;

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
      taxAmount: tax,
      totalAmount: total,
      notes: notes || null,
      items: lines.map((l) => ({
        itemName: l.itemName,
        sku: l.sku || null,
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        amount: lineAmount(l),
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
      {/* Bill Info */}
      <Card>
        <CardHeader title="Bill Info" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Select
                label="Vendor"
                required
                options={vendorOptions}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
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

      {/* Line Items */}
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
                <Th>SKU</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit Price</Th>
                <Th align="right">Amount</Th>
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
                    <Input
                      value={line.sku}
                      onChange={(e) => updateLine(idx, 'sku', e.target.value)}
                      placeholder="SKU"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      placeholder="0"
                      className="w-20 text-right"
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

      {/* Summary */}
      <Card>
        <CardHeader title="Summary" />
        <CardContent>
          <div className="flex items-start justify-between gap-8">
            <div className="w-40">
              <Input
                label="Tax Amount"
                type="number"
                min="0"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex w-56 justify-between gap-4">
                <span className="text-zinc-500 dark:text-zinc-400">Subtotal</span>
                <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
              </div>
              <div className="flex w-56 justify-between gap-4">
                <span className="text-zinc-500 dark:text-zinc-400">Tax</span>
                <span className="font-mono tabular-nums">{formatINR(tax)}</span>
              </div>
              <div className="flex w-56 justify-between gap-4 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
                <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatINR(total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
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
