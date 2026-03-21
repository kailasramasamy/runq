import { useState } from 'react';
import { useVendors } from '../../hooks/queries/use-vendors';
import { createAdvancePaymentSchema } from '@runq/validators';
import type { CreateAdvancePaymentInput } from '@runq/validators';
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
  onSubmit: (data: CreateAdvancePaymentInput) => void;
  isLoading: boolean;
}

export function AdvancePaymentForm({ onSubmit, isLoading }: Props) {
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data } = useVendors({ limit: 100 });
  const vendors = data?.data ?? [];

  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createAdvancePaymentSchema.safeParse({
      vendorId,
      bankAccountId,
      paymentMethod: 'bank_transfer',
      referenceNumber: utrNumber || null,
      paymentDate,
      amount: Number(amount),
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
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader title="Advance Payment Details" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Vendor"
              required
              options={vendorOptions}
              value={vendorId}
              error={errors.vendorId}
              onChange={(e) => setVendorId(e.target.value)}
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
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading}>
            Record Advance
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
