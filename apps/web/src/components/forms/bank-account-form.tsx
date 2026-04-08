import { useState } from 'react';
import { createBankAccountSchema } from '@runq/validators';
import type { CreateBankAccountInput } from '@runq/validators';
import type { BankAccount } from '@runq/types';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Select,
} from '@/components/ui';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'current', label: 'Current Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'overdraft', label: 'Overdraft Account' },
  { value: 'cash_credit', label: 'Cash Credit' },
];

type AccountType = 'current' | 'savings' | 'overdraft' | 'cash_credit';

interface Props {
  onSubmit: (data: CreateBankAccountInput) => void;
  isLoading: boolean;
  initialData?: BankAccount;
  onCancel?: () => void;
  submitLabel?: string;
}

export function BankAccountForm({ onSubmit, isLoading, initialData, onCancel, submitLabel }: Props) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [bankName, setBankName] = useState(initialData?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(initialData?.accountNumber ?? '');
  const [ifscCode, setIfscCode] = useState(initialData?.ifscCode ?? '');
  const [accountType, setAccountType] = useState<AccountType>(
    (initialData?.accountType as AccountType) ?? 'current',
  );
  const [openingBalance, setOpeningBalance] = useState(
    initialData ? String(initialData.openingBalance) : '0',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createBankAccountSchema.safeParse({
      name,
      bankName,
      accountNumber,
      ifscCode,
      accountType,
      openingBalance: Number(openingBalance),
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Account Details" />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Account Name"
              required
              placeholder="e.g. HDFC Current Account"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Bank Name"
              required
              placeholder="e.g. HDFC Bank"
              value={bankName}
              error={errors.bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <Input
              label="Account Number"
              required
              placeholder="e.g. 50100123456789"
              value={accountNumber}
              error={errors.accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
            <Input
              label="IFSC Code"
              required
              placeholder="e.g. HDFC0001234"
              value={ifscCode}
              error={errors.ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            />
            <Select
              label="Account Type"
              required
              options={ACCOUNT_TYPE_OPTIONS}
              value={accountType}
              error={errors.accountType}
              onChange={(e) =>
                setAccountType(
                  e.target.value as 'current' | 'savings' | 'overdraft' | 'cash_credit',
                )
              }
            />
            <Input
              label="Opening Balance (₹)"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={openingBalance}
              error={errors.openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isLoading}>
            {submitLabel ?? (initialData ? 'Save Changes' : 'Create Account')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
