import { useState } from 'react';
import { pettyCashTransactionSchema } from '@runq/validators';
import type { PettyCashTransactionInput } from '@runq/validators';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Select,
  Textarea,
  DateInput,
} from '@/components/ui';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'replenishment', label: 'Replenishment' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'travel', label: 'Travel' },
  { value: 'food', label: 'Food & Beverages' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
];

interface Props {
  onSubmit: (data: PettyCashTransactionInput) => void;
  isLoading: boolean;
  onCancel?: () => void;
}

export function PettyCashTransactionForm({ onSubmit, isLoading, onCancel }: Props) {
  const [type, setType] = useState<'expense' | 'replenishment'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [receiptUrl, setReceiptUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = pettyCashTransactionSchema.safeParse({
      type,
      amount: Number(amount),
      description,
      category: category || null,
      transactionDate,
      receiptUrl: receiptUrl || null,
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
        <CardHeader title="New Transaction" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              required
              options={TYPE_OPTIONS}
              value={type}
              error={errors.type}
              onChange={(e) => setType(e.target.value as 'expense' | 'replenishment')}
            />
            <Input
              label="Amount (₹)"
              required
              type="number"
              min={0.01}
              step={0.01}
              placeholder="500.00"
              value={amount}
              error={errors.amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="col-span-2">
              <Textarea
                label="Description"
                required
                placeholder="Brief description of the transaction"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-600">{errors.description}</p>
              )}
            </div>
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={category}
              error={errors.category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <DateInput
              label="Transaction Date"
              required
              value={transactionDate}
              error={errors.transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
            <div className="col-span-2">
              <Input
                label="Receipt URL (optional)"
                type="url"
                placeholder="https://..."
                value={receiptUrl}
                error={errors.receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isLoading}>
            Add Transaction
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
