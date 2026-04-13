import { useState, useMemo } from 'react';
import { createCustomerSchema } from '@runq/validators';
import type { Customer } from '@runq/types';
import type { CreateCustomerInput } from '@runq/validators';
import { Card, CardHeader, CardContent, Input, Select, Button } from '@/components/ui';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';

interface Props {
  initialData?: Customer;
  onSubmit: (data: CreateCustomerInput) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

type FormState = Partial<CreateCustomerInput> & { name: string };

function buildInitial(c?: Customer): FormState {
  if (!c) return { name: '', type: 'b2b', paymentTermsDays: 30 };
  return {
    name: c.name,
    nickname: c.nickname ?? undefined,
    type: c.type,
    email: c.email ?? undefined,
    ccEmail: c.ccEmail ?? undefined,
    phone: c.phone ?? undefined,
    gstin: c.gstin ?? undefined,
    pan: c.pan ?? undefined,
    addressLine1: c.addressLine1 ?? undefined,
    addressLine2: c.addressLine2 ?? undefined,
    city: c.city ?? undefined,
    state: c.state ?? undefined,
    pincode: c.pincode ?? undefined,
    creditLimit: c.creditLimit ?? undefined,
    paymentTermsDays: c.paymentTermsDays,
    contactPerson: c.contactPerson ?? undefined,
    customerGroup: c.customerGroup ?? undefined,
    overdueInterestRate: c.overdueInterestRate ?? undefined,
    defaultBankAccountId: c.defaultBankAccountId ?? undefined,
  };
}

const TYPE_OPTIONS = [
  { value: 'b2b', label: 'B2B' },
  { value: 'payment_gateway', label: 'Payment Gateway' },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: '0', label: 'Due on receipt' },
  { value: '7', label: 'Net 7' },
  { value: '15', label: 'Net 15' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '90', label: 'Net 90' },
];

export function CustomerForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [form, setForm] = useState<FormState>(buildInitial(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Bank account picker — used to designate which account appears on this
  // customer's invoices. Without this, the print template falls back to the
  // tenant default and otherwise shows nothing (we never auto-list all banks).
  const { data: banksData } = useBankAccounts();
  const bankOptions = useMemo(() => {
    const banks = banksData?.data ?? [];
    return [
      { value: '', label: '— Use tenant default —' },
      ...banks
        .filter((b) => b.isActive)
        .map((b) => ({
          value: b.id,
          label: `${b.bankName} · ${b.accountNumber}${b.name && b.name !== b.bankName ? ` (${b.name})` : ''}`,
        })),
    ];
  }, [banksData]);

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createCustomerSchema.safeParse({
      ...form,
      paymentTermsDays: Number(form.paymentTermsDays ?? 30),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        const key = err.path[0] as string;
        if (!errs[key]) errs[key] = err.message;
      });
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  }

  const field = (f: keyof FormState) => ({
    value: (form[f] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(f, e.target.value),
    error: errors[f],
  });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Basic Info" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Customer Name" required placeholder="Acme Corp Pvt Ltd" {...field('name')} />
          </div>
          <Input
            label="Nickname"
            placeholder="e.g. Acme"
            helper="Optional shorthand for fast lookup. Used by search and the PO Inbox parser."
            {...field('nickname')}
          />
          <Select
            label="Type"
            required
            options={TYPE_OPTIONS}
            value={form.type ?? 'b2b'}
            onChange={(e) => set('type', e.target.value)}
            error={errors.type}
          />
          <Input label="Contact Person" placeholder="Ravi Kumar" {...field('contactPerson')} />
          <Input
            label="Customer Group"
            placeholder="e.g. Wholesale, Retail, Enterprise, Walk-in"
            helper="Used to apply group-level price lists. Leave blank if not used."
            {...field('customerGroup')}
          />
          <Input label="Email" placeholder="billing@acme.com" helper="Comma-separated for multiple" {...field('email')} />
          <Input label="CC Email" placeholder="accounts@acme.com" helper="Included on escalation reminders" {...field('ccEmail')} />
          <Input label="Phone" placeholder="+91 98765 43210" {...field('phone')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax Info" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="GSTIN" placeholder="27AAPFU0939F1ZV" className="uppercase" {...field('gstin')} />
          <Input label="PAN" placeholder="AAPFU0939F" className="uppercase" {...field('pan')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Address Line 1" placeholder="Building, Street" {...field('addressLine1')} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Address Line 2" placeholder="Area, Landmark" {...field('addressLine2')} />
          </div>
          <Input label="City" placeholder="Mumbai" {...field('city')} />
          <Input label="State" placeholder="Maharashtra" {...field('state')} />
          <Input label="Pincode" placeholder="400001" {...field('pincode')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Payment Terms" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Payment Terms"
            options={PAYMENT_TERMS_OPTIONS}
            value={String(form.paymentTermsDays ?? 30)}
            onChange={(e) => set('paymentTermsDays', Number(e.target.value))}
            error={errors.paymentTermsDays}
          />
          <Input
            label="Credit Limit (₹)"
            type="number"
            min="0"
            placeholder="e.g. 500000"
            value={form.creditLimit != null ? String(form.creditLimit) : ''}
            onChange={(e) => set('creditLimit', e.target.value === '' ? (undefined as unknown as number) : Number(e.target.value))}
            error={errors.creditLimit}
          />
          <Input
            label="Overdue Interest Rate (% p.a.)"
            type="number"
            min="0"
            max="100"
            step="0.5"
            placeholder="e.g. 18"
            value={form.overdueInterestRate != null ? String(form.overdueInterestRate) : ''}
            onChange={(e) => set('overdueInterestRate', e.target.value === '' ? (undefined as unknown as number) : Number(e.target.value))}
            error={errors.overdueInterestRate}
          />
          <div className="sm:col-span-2">
            <Select
              label="Bank Account on Invoices"
              options={bankOptions}
              value={(form.defaultBankAccountId as string) ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  defaultBankAccountId: e.target.value === '' ? undefined : e.target.value,
                }))
              }
              helper="Only this bank account will be shown on invoices for this customer. Leave blank to use the tenant default."
              error={errors.defaultBankAccountId}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isLoading}>
          Save Customer
        </Button>
      </div>
    </form>
  );
}
