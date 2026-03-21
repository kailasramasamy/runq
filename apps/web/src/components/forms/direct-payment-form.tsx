import { useState } from 'react';
import { useVendors } from '../../hooks/queries/use-vendors';
import { useBankAccounts } from '../../hooks/queries/use-bank-accounts';
import { createDirectPaymentSchema } from '@runq/validators';
import type { CreateDirectPaymentInput } from '@runq/validators';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Select,
  Input,
  DateInput,
  Textarea,
  Combobox,
} from '@/components/ui';

const EXPENSE_CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'salary', label: 'Salary' },
  { value: 'transport', label: 'Transport' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'other', label: 'Other' },
];

interface Props {
  onSubmit: (data: CreateDirectPaymentInput) => void;
  isLoading: boolean;
}

export function DirectPaymentForm({ onSubmit, isLoading }: Props) {
  const [vendorId, setVendorId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendorsData } = useVendors({ limit: 100 });
  const { data: bankData } = useBankAccounts();

  const vendors = vendorsData?.data ?? [];
  const bankAccounts = bankData?.data ?? [];

  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  const bankOptions = [
    { value: '', label: 'Select bank account…' },
    ...bankAccounts.map((b) => ({ value: b.id, label: `${b.name} (****${b.accountNumber.slice(-4)})` })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createDirectPaymentSchema.safeParse({
      vendorId,
      bankAccountId,
      paymentMethod: 'bank_transfer',
      referenceNumber: referenceNumber || null,
      paymentDate,
      amount: Number(amount),
      notes: notes || null,
      category: category || null,
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
        <CardHeader title="Payment Details" />
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Combobox
              label="Vendor"
              required
              options={vendorOptions}
              value={vendorId}
              error={errors.vendorId}
              placeholder="Search vendor…"
              onChange={(value) => setVendorId(value)}
            />
          </div>
          <Input
            label="Amount"
            type="number"
            min={0.01}
            step={0.01}
            required
            placeholder="0.00"
            value={amount}
            error={errors.amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select
            label="Bank Account"
            required
            options={bankOptions}
            value={bankAccountId}
            error={errors.bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          />
          <Input
            label="UTR / Reference Number"
            placeholder="UTR123456789"
            value={referenceNumber}
            error={errors.referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
          />
          <DateInput
            label="Payment Date"
            required
            value={paymentDate}
            error={errors.paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
          <Select
            label="Expense Category"
            options={EXPENSE_CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <div className="col-span-2">
            <Textarea
              label="Notes"
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading}>
            Record Payment
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
