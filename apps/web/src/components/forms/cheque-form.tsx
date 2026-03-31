import { useState } from 'react';
import { createChequeSchema } from '@runq/validators';
import type { CreateChequeInput } from '@runq/validators';
import { Button, Card, CardHeader, CardContent, CardFooter, Input, Select, Combobox, DateInput } from '@/components/ui';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useVendors } from '@/hooks/queries/use-vendors';

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
  const { data: customersData } = useCustomers({ limit: 100 });
  const { data: vendorsData } = useVendors({ limit: 100 });
  const partyOptions = form.partyType === 'customer'
    ? (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }))
    : (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }));

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
              onChange={(e) => {
                const type = e.target.value;
                const partyType = type === 'received' ? 'customer' : 'vendor';
                setForm((prev) => ({ ...prev, type: type as 'received' | 'issued', partyType: partyType as 'customer' | 'vendor', partyId: '' }));
              }}
              options={[
                { label: 'Received', value: 'received' },
                { label: 'Issued', value: 'issued' },
              ]}
            />
            <Combobox
              label={form.partyType === 'customer' ? 'Customer' : 'Vendor'}
              required
              options={partyOptions}
              value={form.partyId}
              onChange={(v) => handleChange('partyId', v)}
              placeholder={`Search ${form.partyType}...`}
              error={errors.partyId}
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
            <DateInput
              label="Cheque Date"
              required
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
