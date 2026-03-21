import { useState } from 'react';
import { useCustomers } from '../../hooks/queries/use-customers';
import { useInvoices } from '../../hooks/queries/use-invoices';
import { createReceiptSchema } from '@runq/validators';
import type { CreateReceiptInput } from '@runq/validators';
import type { SalesInvoiceWithDetails } from '@runq/types';
import { formatINR } from '../../lib/utils';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Input,
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
  onSubmit: (data: CreateReceiptInput) => void;
  isLoading: boolean;
}

type AllocationMap = Record<string, string>;

interface InvoiceRowProps {
  invoice: SalesInvoiceWithDetails;
  checked: boolean;
  allocation: string;
  onToggle: () => void;
  onAllocChange: (v: string) => void;
}

function InvoiceRow({ invoice, checked, allocation, onToggle, onAllocChange }: InvoiceRowProps) {
  return (
    <TableRow className={checked ? 'bg-indigo-50/60 dark:bg-indigo-900/10' : ''}>
      <TableCell className="w-10">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
        />
      </TableCell>
      <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{invoice.dueDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(invoice.totalAmount)}</TableCell>
      <TableCell align="right" numeric>{formatINR(invoice.amountReceived)}</TableCell>
      <TableCell align="right" numeric className="font-medium">{formatINR(invoice.balanceDue)}</TableCell>
      <TableCell align="right">
        <input
          type="number"
          min={0.01}
          step={0.01}
          max={invoice.balanceDue}
          value={allocation}
          onChange={(e) => onAllocChange(e.target.value)}
          disabled={!checked}
          className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800"
        />
      </TableCell>
    </TableRow>
  );
}

export function ReceiptForm({ onSubmit, isLoading }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allocations, setAllocations] = useState<AllocationMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: customersData } = useCustomers({ limit: 100 });
  const { data: invoicesData } = useInvoices(
    customerId ? { customerId, status: 'sent' } : undefined,
  );
  const { data: partialData } = useInvoices(
    customerId ? { customerId, status: 'partially_paid' } : undefined,
  );

  const customers = customersData?.data ?? [];
  const sentInvoices = invoicesData?.data ?? [];
  const partialInvoices = partialData?.data ?? [];
  const invoices = [...sentInvoices, ...partialInvoices];

  const customerOptions = [
    { value: '', label: 'Select customer…' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  function toggleInvoice(id: string, balanceDue: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setAllocations((a) => ({ ...a, [id]: String(balanceDue) }));
      }
      return next;
    });
  }

  const totalAllocated = Array.from(selected).reduce(
    (sum, id) => sum + Number(allocations[id] ?? 0),
    0,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allocationItems = Array.from(selected).map((id) => ({
      invoiceId: id,
      amount: Number(allocations[id] ?? 0),
    }));

    const parsed = createReceiptSchema.safeParse({
      customerId,
      bankAccountId,
      paymentMethod: 'bank_transfer',
      referenceNumber: referenceNumber || null,
      receiptDate,
      totalAmount: totalAllocated,
      allocations: allocationItems,
      notes: notes || null,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => { errs[err.path[0] as string] = err.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const hasCustomer = !!customerId;
  const hasInvoices = selected.size > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Step 1: Select Customer */}
      <Card>
        <CardHeader title="1. Select Customer" />
        <CardContent>
          <div className="max-w-sm">
            <Select
              label="Customer"
              required
              options={customerOptions}
              value={customerId}
              error={errors.customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSelected(new Set());
                setAllocations({});
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Select Invoices */}
      <Card className={!hasCustomer ? 'pointer-events-none opacity-50' : ''}>
        <CardHeader title="2. Select Invoices" />
        <CardContent className="p-0">
          {!hasCustomer ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              Select a customer to load invoices.
            </p>
          ) : invoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No sent or partially paid invoices for this customer.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <Th className="w-10" />
                  <Th>Invoice #</Th>
                  <Th>Due Date</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Received</Th>
                  <Th align="right">Balance</Th>
                  <Th align="right">Allocate</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    checked={selected.has(inv.id)}
                    allocation={allocations[inv.id] ?? String(inv.balanceDue)}
                    onToggle={() => toggleInvoice(inv.id, inv.balanceDue)}
                    onAllocChange={(v) => setAllocations((a) => ({ ...a, [inv.id]: v }))}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {errors.allocations && (
            <p className="px-4 pb-3 text-xs text-red-600">{errors.allocations}</p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Payment Details */}
      <Card className={!hasCustomer ? 'pointer-events-none opacity-50' : ''}>
        <CardHeader title="3. Receipt Details" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Bank Account ID"
              required
              placeholder="UUID of bank account"
              value={bankAccountId}
              error={errors.bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            />
            <Input
              label="Reference Number"
              placeholder="UTR / NEFT reference"
              value={referenceNumber}
              error={errors.referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
            <DateInput
              label="Receipt Date"
              required
              value={receiptDate}
              error={errors.receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
            />
            <div className="col-span-2">
              <Textarea
                label="Notes"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Summary */}
      <Card className={!hasInvoices ? 'opacity-50' : ''}>
        <CardHeader title="4. Summary" />
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Receipt Amount</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(totalAllocated)}
              </p>
              {errors.totalAmount && (
                <p className="mt-1 text-xs text-red-600">{errors.totalAmount}</p>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {selected.size} invoice{selected.size !== 1 ? 's' : ''} selected
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading} disabled={!hasCustomer || !hasInvoices}>
            Record Receipt
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
