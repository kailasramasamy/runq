import { useState } from 'react';
import { createVendorSchema } from '@runq/validators';
import type { Vendor } from '@runq/types';
import type { CreateVendorInput } from '@runq/validators';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { Card, CardHeader, CardContent, Input, Select, Button } from '@/components/ui';

interface Props {
  initialData?: Vendor;
  onSubmit: (data: CreateVendorInput) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

type FormState = Partial<CreateVendorInput> & { name: string };

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_EXPENSE_DEFAULTS: Record<string, string> = {
  raw_material: '5001',
  equipment: '5305',
  logistics: '5701',
  service_provider: '5401',
  utilities: '5302',
};

function buildInitial(v?: Vendor): FormState {
  if (!v) return { name: '', paymentTermsDays: 30 };
  return {
    name: v.name,
    email: v.email ?? undefined,
    phone: v.phone ?? undefined,
    gstin: v.gstin ?? undefined,
    pan: v.pan ?? undefined,
    addressLine1: v.addressLine1 ?? undefined,
    addressLine2: v.addressLine2 ?? undefined,
    city: v.city ?? undefined,
    state: v.state ?? undefined,
    pincode: v.pincode ?? undefined,
    bankAccountName: v.bankAccountName ?? undefined,
    bankAccountNumber: v.bankAccountNumber ?? undefined,
    bankIfsc: v.bankIfsc ?? undefined,
    bankName: v.bankName ?? undefined,
    paymentTermsDays: v.paymentTermsDays,
    earlyPaymentDiscountPercent: v.earlyPaymentDiscountPercent ?? undefined,
    earlyPaymentDiscountDays: v.earlyPaymentDiscountDays ?? undefined,
    category: v.category ?? undefined,
    expenseAccountCode: v.expenseAccountCode ?? undefined,
  };
}

const PAYMENT_TERMS_OPTIONS = [
  { value: '0', label: 'Due on receipt' },
  { value: '7', label: 'Net 7' },
  { value: '15', label: 'Net 15' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '90', label: 'Net 90' },
];

export function VendorForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [form, setForm] = useState<FormState>(buildInitial(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: accountsData } = useGLAccounts();
  const allAccounts = (accountsData?.data ?? []).filter((a) => a.isActive);

  const ASSET_CATEGORIES = new Set(['raw_material', 'equipment']);
  const ASSET_CODE_PREFIXES = ['11', '12', '13'];

  function getExpenseAccountOptions() {
    const showAssets = ASSET_CATEGORIES.has(form.category as string);
    const filtered = allAccounts.filter((a) => {
      if (a.type === 'expense') return true;
      if (showAssets && a.type === 'asset') {
        return ASSET_CODE_PREFIXES.some((p) => a.code.startsWith(p) && a.code.length === 4);
      }
      return false;
    });
    return [
      { value: '', label: 'Default (Purchase Expenses)' },
      ...filtered.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })),
    ];
  }

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createVendorSchema.safeParse({
      ...form,
      paymentTermsDays: Number(form.paymentTermsDays ?? 30),
      earlyPaymentDiscountPercent: form.earlyPaymentDiscountPercent ? Number(form.earlyPaymentDiscountPercent) : null,
      earlyPaymentDiscountDays: form.earlyPaymentDiscountDays ? Number(form.earlyPaymentDiscountDays) : null,
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
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Vendor Name" required placeholder="Acme Supplies Pvt Ltd" {...field('name')} />
          </div>
          <Input label="Email" type="email" placeholder="billing@acme.com" {...field('email')} />
          <Input label="Phone" placeholder="+91 98765 43210" {...field('phone')} />
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={(form.category as string) ?? ''}
            onChange={(e) => {
              const cat = e.target.value;
              set('category', cat);
              if (!form.expenseAccountCode) {
                const defaultCode = CATEGORY_EXPENSE_DEFAULTS[cat];
                if (defaultCode) set('expenseAccountCode', defaultCode);
              }
            }}
            error={errors.category}
          />
          <Select
            label="Expense Account"
            options={getExpenseAccountOptions()}
            value={(form.expenseAccountCode as string) ?? ''}
            onChange={(e) => set('expenseAccountCode', e.target.value)}
            error={errors.expenseAccountCode}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax & Compliance" />
        <CardContent className="grid grid-cols-2 gap-4">
          <Input label="GSTIN" placeholder="27AAPFU0939F1ZV" className="uppercase" {...field('gstin')} />
          <Input label="PAN" placeholder="AAPFU0939F" className="uppercase" {...field('pan')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Address Line 1" placeholder="Building, Street" {...field('addressLine1')} />
          </div>
          <div className="col-span-2">
            <Input label="Address Line 2" placeholder="Area, Landmark" {...field('addressLine2')} />
          </div>
          <Input label="City" placeholder="Mumbai" {...field('city')} />
          <Input label="State" placeholder="Maharashtra" {...field('state')} />
          <Input label="Pincode" placeholder="400001" {...field('pincode')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Bank Details" />
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Account Name" placeholder="Acme Supplies Pvt Ltd" {...field('bankAccountName')} />
          </div>
          <Input label="Account Number" placeholder="012345678901" {...field('bankAccountNumber')} />
          <Input label="IFSC Code" placeholder="HDFC0001234" className="uppercase" {...field('bankIfsc')} />
          <div className="col-span-2">
            <Input label="Bank Name" placeholder="HDFC Bank" {...field('bankName')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Payment Terms" />
        <CardContent className="grid grid-cols-2 gap-4">
          <Select
            label="Payment Terms"
            options={PAYMENT_TERMS_OPTIONS}
            value={String(form.paymentTermsDays ?? 30)}
            onChange={(e) => set('paymentTermsDays', Number(e.target.value))}
            error={errors.paymentTermsDays}
          />
          <div />
          <Input
            label="Early Payment Discount %"
            type="number"
            placeholder="e.g. 2"
            value={form.earlyPaymentDiscountPercent != null ? String(form.earlyPaymentDiscountPercent) : ''}
            onChange={(e) => set('earlyPaymentDiscountPercent', e.target.value ? Number(e.target.value) : '')}
            error={errors.earlyPaymentDiscountPercent}
          />
          <Input
            label="Discount If Paid Within (days)"
            type="number"
            placeholder="e.g. 10"
            value={form.earlyPaymentDiscountDays != null ? String(form.earlyPaymentDiscountDays) : ''}
            onChange={(e) => set('earlyPaymentDiscountDays', e.target.value ? Number(e.target.value) : '')}
            error={errors.earlyPaymentDiscountDays}
          />
          {form.earlyPaymentDiscountPercent && form.earlyPaymentDiscountDays && (
            <p className="col-span-2 text-xs text-zinc-500">
              {form.earlyPaymentDiscountPercent}% discount if paid within {form.earlyPaymentDiscountDays} days (i.e. {form.earlyPaymentDiscountPercent}/{form.earlyPaymentDiscountDays} net {form.paymentTermsDays ?? 30})
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isLoading}>
          Save Vendor
        </Button>
      </div>
    </form>
  );
}
