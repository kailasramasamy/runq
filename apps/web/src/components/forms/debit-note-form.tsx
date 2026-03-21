import { useState } from 'react';
import { createDebitNoteSchema } from '@runq/validators';
import type { CreateDebitNoteInput } from '@runq/validators';
import type { PurchaseInvoice } from '@runq/types';
import { useVendors } from '../../hooks/queries/use-vendors';
import { api } from '../../lib/api-client';
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse } from '@runq/types';
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
  onSubmit: (data: CreateDebitNoteInput) => void;
  isLoading: boolean;
}

interface FormState {
  vendorId: string;
  invoiceId: string;
  issueDate: string;
  amount: string;
  reason: string;
}

export function DebitNoteForm({ onSubmit, isLoading }: Props) {
  const [form, setForm] = useState<FormState>({
    vendorId: '',
    invoiceId: '',
    issueDate: '',
    amount: '',
    reason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendorData } = useVendors({ limit: 100 });
  const vendors = vendorData?.data ?? [];

  const { data: invoiceData } = useQuery({
    queryKey: ['invoices', 'by-vendor', form.vendorId],
    queryFn: () =>
      api.get<PaginatedResponse<PurchaseInvoice>>(
        `/ap/purchase-invoices?vendorId=${form.vendorId}&limit=100`,
      ),
    enabled: !!form.vendorId,
  });
  const invoices = invoiceData?.data ?? [];

  const vendorOptions = [
    { value: '', label: 'Select vendor…' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  const invoiceOptions = [
    { value: '', label: 'None' },
    ...invoices.map((inv) => ({ value: inv.id, label: inv.invoiceNumber })),
  ];

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'vendorId' ? { invoiceId: '' } : {}),
    }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createDebitNoteSchema.safeParse({
      vendorId: form.vendorId,
      invoiceId: form.invoiceId || null,
      issueDate: form.issueDate,
      amount: Number(form.amount),
      reason: form.reason,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => { errs[err.path[0] as string] = err.message; });
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader title="Debit Note Information" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Vendor"
              required
              options={vendorOptions}
              value={form.vendorId}
              error={errors.vendorId}
              onChange={(e) => set('vendorId', e.target.value)}
            />
            <Select
              label="Linked Invoice (optional)"
              options={invoiceOptions}
              value={form.invoiceId}
              error={errors.invoiceId}
              disabled={!form.vendorId}
              onChange={(e) => set('invoiceId', e.target.value)}
            />
            <DateInput
              label="Issue Date"
              required
              value={form.issueDate}
              error={errors.issueDate}
              onChange={(e) => set('issueDate', e.target.value)}
            />
            <Input
              label="Amount (₹)"
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              error={errors.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
            <div className="col-span-2">
              <Textarea
                label="Reason"
                required
                placeholder="Reason for debit note…"
                value={form.reason}
                error={errors.reason}
                onChange={(e) => set('reason', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" loading={isLoading}>
            Create Debit Note
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
