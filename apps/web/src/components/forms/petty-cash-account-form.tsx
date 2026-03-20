import { useState } from 'react';
import { createPettyCashAccountSchema } from '@runq/validators';
import type { CreatePettyCashAccountInput } from '@runq/validators';
import { Button, Card, CardHeader, CardContent, CardFooter, Input } from '@/components/ui';

interface Props {
  onSubmit: (data: CreatePettyCashAccountInput) => void;
  isLoading: boolean;
  onCancel?: () => void;
}

export function PettyCashAccountForm({ onSubmit, isLoading, onCancel }: Props) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [cashLimit, setCashLimit] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createPettyCashAccountSchema.safeParse({
      name,
      location: location || null,
      cashLimit: Number(cashLimit),
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
        <CardHeader title="New Petty Cash Account" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Name"
              required
              placeholder="e.g. Head Office Petty Cash"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Location"
              placeholder="e.g. Mumbai HQ"
              value={location}
              error={errors.location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Input
              label="Cash Limit (₹)"
              required
              type="number"
              min={1}
              step={0.01}
              placeholder="10000.00"
              value={cashLimit}
              error={errors.cashLimit}
              onChange={(e) => setCashLimit(e.target.value)}
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
            Create Account
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
