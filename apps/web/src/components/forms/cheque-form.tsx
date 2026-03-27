import { useState } from 'react';
import { createChequeSchema } from '@runq/validators';
import type { CreateChequeInput } from '@runq/validators';
import { Button, Card, CardHeader, CardContent, CardFooter, Input, Select } from '@/components/ui';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';

interface Props {
  onSubmit: (data: CreateChequeInput) => void;
  isLoading: boolean;
  onCancel?: () => void;
}

export function ChequeForm({ onSubmit, isLoading, onCancel }: Props) {
  const [form, setForm] = useState({
    chequeNumber: '',
    bankAccountId: '',
    type: 'received' as const,
    partyType: 'customer' as const,
    partyId: '',
    amount: '',
    chequeDate: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: bankData } = useBankAccounts();
  const accounts = bankData?.data ?? [];

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createChequeSchema.safeParse({
      ...form,
      amount: Number(form.amount),
      notes: form.notes || null,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        errs[err.path[0] as string] = err.message;
      });
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader title="New Cheque" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cheque Number"
              required
              maxLength={20}
              value={form.chequeNumber}
              error={errors.chequeNumber}
              onChange={(e) => handleChange('chequeNumber', e.target.value)}
            />
            <Select
              label="Bank Account"
              required
              value={form.bankAccountId}
              error={errors.bankAccountId}
              onChange={(e) => handleChange('bankAccountId', e.target.value)}
              options={[
                { label: 'Select account', value: '' },
                ...accounts.map((a) => ({ label: `${a.name} (${a.accountNumber})`, value: a.id })),
              ]}
            />
            <Select
              label="Type"
              required
              value={form.type}
              onChange={(e) => handleChange('type', e.target.value)}
              options={[
                { label: 'Received', value: 'received' },
                { label: 'Issued', value: 'issued' },
              ]}
            />
            <Select
              label="Party Type"
              required
              value={form.partyType}
              onChange={(e) => handleChange('partyType', e.target.value)}
              options={[
                { label: 'Customer', value: 'customer' },
                { label: 'Vendor', value: 'vendor' },
              ]}
            />
            <Input
              label="Party ID"
              required
              value={form.partyId}
              error={errors.partyId}
              onChange={(e) => handleChange('partyId', e.target.value)}
              placeholder="UUID of customer or vendor"
            />
            <Input
              label="Amount"
              required
              type="number"
              min={0.01}
              step={0.01}
              value={form.amount}
              error={errors.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
            />
            <Input
              label="Cheque Date"
              required
              type="date"
              value={form.chequeDate}
              error={errors.chequeDate}
              onChange={(e) => handleChange('chequeDate', e.target.value)}
            />
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isLoading}>
            Create Cheque
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
