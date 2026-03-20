import { useState } from 'react';
import { useCustomers } from '../../hooks/queries/use-customers';
import { useInvoices } from '../../hooks/queries/use-invoices';
import { createCreditNoteSchema } from '@runq/validators';
import type { CreateCreditNoteInput } from '@runq/validators';
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
} from '@/components/ui';

interface Props {
  onSubmit: (data: CreateCreditNoteInput) => void;
  isLoading: boolean;
}

export function CreditNoteForm({ onSubmit, isLoading }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: customersData } = useCustomers({ limit: 200 });
  const { data: invoicesData } = useInvoices(customerId ? { customerId } : undefined);

  const customers = customersData?.data ?? [];
  const invoices = invoicesData?.data ?? [];

  const customerOptions = [
    { value: '', label: 'Select customer…' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const invoiceOptions = [
    { value: '', label: 'No linked invoice' },
    ...invoices.map((inv) => ({
      value: inv.id,
      label: `${inv.invoiceNumber} — ${inv.status}`,
    })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = createCreditNoteSchema.safeParse({
      customerId,
      invoiceId: invoiceId || null,
      issueDate,
      amount: Number(amount),
      reason,
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Credit Note Details" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 max-w-sm">
              <Select
                label="Customer"
                required
                options={customerOptions}
                value={customerId}
                error={errors.customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setInvoiceId('');
                }}
              />
            </div>
            <div className="col-span-2 max-w-sm">
              <Select
                label="Linked Invoice (optional)"
                options={invoiceOptions}
                value={invoiceId}
                error={errors.invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              />
            </div>
            <DateInput
              label="Issue Date"
              required
              value={issueDate}
              error={errors.issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <Input
              label="Amount (₹)"
              required
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={amount}
              error={errors.amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="col-span-2">
              <Textarea
                label="Reason"
                required
                placeholder="Reason for credit note…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {errors.reason && (
                <p className="mt-1 text-xs text-red-600">{errors.reason}</p>
              )}
            </div>
            <div className="col-span-2">
              <Textarea
                label="Notes (optional)"
                placeholder="Additional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading} disabled={!customerId || !amount || !reason}>
            Save Credit Note
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
