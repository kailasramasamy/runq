import { useState } from 'react';
import { useVendors } from '../../hooks/queries/use-vendors';
import { usePurchaseInvoices } from '../../hooks/queries/use-purchase-invoices';
import { createVendorPaymentSchema } from '@runq/validators';
import type { CreateVendorPaymentInput } from '@runq/validators';
import type { PurchaseInvoice } from '@runq/types';
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
  onSubmit: (data: CreateVendorPaymentInput) => void;
  isLoading: boolean;
}

type AllocationMap = Record<string, string>;

interface InvoiceRowProps {
  invoice: PurchaseInvoice;
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
      <TableCell align="right" numeric>{formatINR(invoice.totalAmount)}</TableCell>
      <TableCell align="right" numeric>{formatINR(invoice.amountPaid)}</TableCell>
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

export function PaymentForm({ onSubmit, isLoading }: Props) {
  const [vendorId, setVendorId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allocations, setAllocations] = useState<AllocationMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendorsData } = useVendors({ limit: 100 });
  const { data: invoicesData } = usePurchaseInvoices(vendorId ? { vendorId } : undefined);

  const vendors = vendorsData?.data ?? [];
  const invoices = (invoicesData?.data ?? []).filter(
    (inv) => inv.status === 'approved' || inv.status === 'partially_paid',
  );

  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
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

    const parsed = createVendorPaymentSchema.safeParse({
      vendorId,
      bankAccountId,
      paymentMethod: 'bank_transfer',
      referenceNumber: utrNumber || null,
      paymentDate,
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

  const hasVendor = !!vendorId;
  const hasInvoices = selected.size > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Step 1: Select Vendor */}
      <Card>
        <CardHeader title="1. Select Vendor" />
        <CardContent>
          <div className="max-w-sm">
            <Select
              label="Vendor"
              required
              options={vendorOptions}
              value={vendorId}
              error={errors.vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setSelected(new Set());
                setAllocations({});
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Select Invoices */}
      <Card className={!hasVendor ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="2. Select Invoices" />
        <CardContent className="p-0">
          {!hasVendor ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              Select a vendor to load invoices.
            </p>
          ) : invoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No approved or partially paid invoices for this vendor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <Th className="w-10" />
                  <Th>Invoice #</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Paid</Th>
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
      <Card className={!hasVendor ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="3. Payment Details" />
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
              label="UTR / Reference Number"
              placeholder="UTR123456789"
              value={utrNumber}
              error={errors.referenceNumber}
              onChange={(e) => setUtrNumber(e.target.value)}
            />
            <DateInput
              label="Payment Date"
              required
              value={paymentDate}
              error={errors.paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Payment Amount</p>
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
          <Button type="submit" loading={isLoading} disabled={!hasVendor || !hasInvoices}>
            Record Payment
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
