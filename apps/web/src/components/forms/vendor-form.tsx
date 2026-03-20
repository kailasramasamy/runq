import { useState } from 'react';
import { createVendorSchema } from '@runq/validators';
import type { Vendor } from '@runq/types';
import type { CreateVendorInput } from '@runq/validators';
import { Card, CardHeader, CardContent, Input, Select, Button } from '@/components/ui';

interface Props {
  initialData?: Vendor;
  onSubmit: (data: CreateVendorInput) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

type FormState = Partial<CreateVendorInput> & { name: string };

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

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createVendorSchema.safeParse({
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
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Vendor Name" required placeholder="Acme Supplies Pvt Ltd" {...field('name')} />
          </div>
          <Input label="Email" type="email" placeholder="billing@acme.com" {...field('email')} />
          <Input label="Phone" placeholder="+91 98765 43210" {...field('phone')} />
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
