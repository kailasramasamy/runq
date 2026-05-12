import { useState } from 'react';
import { X } from 'lucide-react';
import { createVendorSchema } from '@runq/validators';
import type { Vendor } from '@runq/types';
import type { CreateVendorInput } from '@runq/validators';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { Card, CardHeader, CardContent, Input, Select, Button, Combobox } from '@/components/ui';

interface Props {
  initialData?: Vendor;
  onSubmit: (data: CreateVendorInput) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

type FormState = Partial<CreateVendorInput> & { name: string };

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'raw_material', label: 'Raw Material / Supplier' },
  { value: 'rent', label: 'Rent / Lease' },
  { value: 'logistics', label: 'Logistics / Transport' },
  { value: 'utilities', label: 'Utilities (Electricity, Water, Gas)' },
  { value: 'telecom', label: 'Telecom / Internet' },
  { value: 'service_provider', label: 'Professional Services (CA, Legal, IT)' },
  { value: 'employee', label: 'Employee (Salary)' },
  { value: 'contractor', label: 'Contractor / Labour' },
  { value: 'maintenance', label: 'Maintenance / Repairs' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'equipment', label: 'Equipment / Machinery' },
  { value: 'packaging', label: 'Packaging Material' },
  { value: 'fuel', label: 'Fuel / Petroleum' },
  { value: 'marketing', label: 'Marketing / Advertising' },
  { value: 'internal_transfer', label: 'Internal Transfer (Own Account)' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_EXPENSE_DEFAULTS: Record<string, string> = {
  raw_material: '5001',
  rent: '5301',
  logistics: '5701',
  utilities: '5302',
  telecom: '5303',
  service_provider: '5401',
  employee: '5201',
  contractor: '5207',
  maintenance: '5305',
  insurance: '5501',
  equipment: '5305',
  packaging: '5002',
  fuel: '5702',
  marketing: '5403',
  internal_transfer: '1101',
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
    treatNoBillAsAdvance: v.treatNoBillAsAdvance ?? false,
    requiresInvoice: v.requiresInvoice ?? false,
    tags: v.tags ?? [],
    earlyPaymentDiscountPercent: v.earlyPaymentDiscountPercent ?? undefined,
    earlyPaymentDiscountDays: v.earlyPaymentDiscountDays ?? undefined,
    category: v.category ?? undefined,
    expenseAccountCode: v.expenseAccountCode ?? undefined,
  };
}

const INDIAN_STATES = [
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
  { value: 'Assam', label: 'Assam' },
  { value: 'Bihar', label: 'Bihar' },
  { value: 'Chhattisgarh', label: 'Chhattisgarh' },
  { value: 'Delhi', label: 'Delhi' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Haryana', label: 'Haryana' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Jharkhand', label: 'Jharkhand' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Manipur', label: 'Manipur' },
  { value: 'Meghalaya', label: 'Meghalaya' },
  { value: 'Mizoram', label: 'Mizoram' },
  { value: 'Nagaland', label: 'Nagaland' },
  { value: 'Odisha', label: 'Odisha' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Sikkim', label: 'Sikkim' },
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Telangana', label: 'Telangana' },
  { value: 'Tripura', label: 'Tripura' },
  { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
  { value: 'Uttarakhand', label: 'Uttarakhand' },
  { value: 'West Bengal', label: 'West Bengal' },
  { value: 'Jammu & Kashmir', label: 'Jammu & Kashmir' },
  { value: 'Ladakh', label: 'Ladakh' },
  { value: 'Chandigarh', label: 'Chandigarh' },
  { value: 'Puducherry', label: 'Puducherry' },
  { value: 'Lakshadweep', label: 'Lakshadweep' },
  { value: 'Andaman & Nicobar', label: 'Andaman & Nicobar' },
  { value: 'Dadra & Nagar Haveli and Daman & Diu', label: 'Dadra & Nagar Haveli and Daman & Diu' },
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

export function VendorForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [form, setForm] = useState<FormState>(buildInitial(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagDraft, setTagDraft] = useState('');

  function addTag(raw: string) {
    const t = raw.trim().slice(0, 50);
    if (!t) return;
    const current = form.tags ?? [];
    if (current.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    setForm((prev) => ({ ...prev, tags: [...(prev.tags ?? []), t] }));
    setTagDraft('');
  }
  function removeTag(t: string) {
    setForm((prev) => ({ ...prev, tags: (prev.tags ?? []).filter((x) => x !== t) }));
  }
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

  function set(field: keyof FormState, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pendingTag = tagDraft.trim();
    const tags = pendingTag && !(form.tags ?? []).some((x) => x.toLowerCase() === pendingTag.toLowerCase())
      ? [...(form.tags ?? []), pendingTag.slice(0, 50)]
      : (form.tags ?? []);
    const parsed = createVendorSchema.safeParse({
      ...form,
      tags,
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
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
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
          <Combobox
            label="Expense Account"
            options={getExpenseAccountOptions()}
            value={(form.expenseAccountCode as string) ?? ''}
            onChange={(v) => set('expenseAccountCode', v)}
            placeholder="Search expense accounts..."
            error={errors.expenseAccountCode}
          />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tags
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800">
              {(form.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="rounded hover:bg-indigo-100 dark:hover:bg-indigo-800"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === 'Backspace' && !tagDraft && (form.tags ?? []).length) {
                    removeTag((form.tags ?? [])[(form.tags ?? []).length - 1]!);
                  }
                }}
                onBlur={() => tagDraft && addTag(tagDraft)}
                placeholder={(form.tags ?? []).length ? '' : 'e.g. A1 Milk, A2 Milk, Buffalo, Oil'}
                className="flex-1 min-w-[120px] border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0 dark:text-zinc-100"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">Press Enter or comma to add a tag.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tax & Compliance" />
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
          <Combobox
            label="State"
            options={INDIAN_STATES}
            value={(form.state as string) ?? ''}
            onChange={(v) => set('state', v)}
            placeholder="Search state..."
            error={errors.state}
          />
          <Input label="Pincode" placeholder="400001" {...field('pincode')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Bank Details" />
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Account Name" placeholder="Acme Supplies Pvt Ltd" {...field('bankAccountName')} />
          </div>
          <Input label="Account Number" placeholder="012345678901" {...field('bankAccountNumber')} />
          <Input label="IFSC Code" placeholder="HDFC0001234" className="uppercase" {...field('bankIfsc')} />
          <div className="sm:col-span-2">
            <Input label="Bank Name" placeholder="HDFC Bank" {...field('bankName')} />
          </div>
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
          <label className="col-span-1 sm:col-span-2 mt-2 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={!!form.treatNoBillAsAdvance}
              onChange={(e) => set('treatNoBillAsAdvance', e.target.checked)}
              className="mt-0.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span>
              <span className="font-medium">Bills issued monthly</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Pre-bill payments accrue as advances (1104 Advance to Suppliers) instead of direct expense.
                Auto-applied when the consolidated bill is created.
              </span>
            </span>
          </label>
          <label className="col-span-1 sm:col-span-2 mt-2 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={!!form.requiresInvoice}
              onChange={(e) => set('requiresInvoice', e.target.checked)}
              className="mt-0.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span>
              <span className="font-medium">Requires tax invoice</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Vendor issues a GST invoice for every bill (oil, packaging, etc.). Bills without an
                attached invoice will appear in Audit → Missing Invoices. Uncheck for unregistered
                suppliers (milk farmers, casual labour).
              </span>
            </span>
          </label>
          {form.earlyPaymentDiscountPercent && form.earlyPaymentDiscountDays && (
            <p className="sm:col-span-2 text-xs text-zinc-500">
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
