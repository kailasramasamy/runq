import { useState, useEffect } from 'react';
import { Building2, Landmark, FileText, Users, Package, CheckCircle2 } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { useCompanySettings, useUpdateCompanySettings, useUpdateInvoiceNumbering, useInvoiceNumbering } from '@/hooks/queries/use-settings';
import { useCreateBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useCreateCustomer } from '@/hooks/queries/use-customers';
import { useCreateItem } from '@/hooks/queries/use-items';
import { INDIAN_STATE_OPTIONS } from '@/lib/indian-states';

// ─── Step Type ───────────────────────────────────────────────────────────────

export interface StepProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const STEP_META = [
  { key: 'company', label: 'Company profile', icon: Building2, optional: false, description: 'Confirm your company details and fiscal year' },
  { key: 'bank', label: 'Bank account', icon: Landmark, optional: false, description: 'Add your primary bank account' },
  { key: 'invoice', label: 'Invoice settings', icon: FileText, optional: false, description: 'Number format and payment terms' },
  { key: 'customer', label: 'First customer', icon: Users, optional: true, description: 'Add a customer to start invoicing' },
  { key: 'item', label: 'First item', icon: Package, optional: true, description: 'Add a product or service' },
] as const;

export type StepKey = typeof STEP_META[number]['key'];

// ─── Company Profile Step ────────────────────────────────────────────────────

const FY_MONTH_OPTIONS = [
  { value: '4', label: 'April (standard)' },
  { value: '1', label: 'January' },
  { value: '7', label: 'July' },
  { value: '10', label: 'October' },
];

const STATE_SELECT_OPTIONS = [{ value: '', label: 'Select state' }, ...INDIAN_STATE_OPTIONS];

export function CompanyProfileStep({ onComplete }: StepProps) {
  const { data: settings } = useCompanySettings();
  const update = useUpdateCompanySettings();
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [fyMonth, setFyMonth] = useState('4');
  const [error, setError] = useState('');

  useEffect(() => {
    const s = settings?.data;
    if (!s) return;
    setLegalName(s.legalName ?? s.name ?? '');
    setGstin(s.gstin ?? '');
    setPan((s as { pan?: string }).pan ?? '');
    setStateCode(s.stateCode ?? '');
    setCity(s.city ?? '');
    setPincode(s.pincode ?? '');
    setFyMonth(String(s.financialYearStartMonth ?? 4));
  }, [settings]);

  const selectedState = INDIAN_STATE_OPTIONS.find((s) => s.value === stateCode);

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!legalName.trim()) return setError('Legal name is required');

    const gstinTrimmed = gstin.trim().toUpperCase();
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (gstinTrimmed && !gstinRegex.test(gstinTrimmed)) {
      return setError('GSTIN format is invalid. Leave blank if you don\'t have one yet.');
    }

    const pincodeTrimmed = pincode.trim();
    if (pincodeTrimmed && !/^[1-9][0-9]{5}$/.test(pincodeTrimmed)) {
      return setError('Pincode must be 6 digits.');
    }

    try {
      await update.mutateAsync({
        currency: 'INR',
        financialYearStartMonth: Number(fyMonth),
        defaultPaymentTermsDays: settings?.data.defaultPaymentTermsDays ?? 30,
        legalName: legalName || null,
        gstin: gstinTrimmed || null,
        state: selectedState?.label ?? null,
        stateCode: stateCode || null,
        city: city.trim() || null,
        pincode: pincodeTrimmed || null,
      });
      onComplete();
    } catch {
      setError('Could not save. Please try again.');
    }
  }

  const hasSignupData = !!(legalName && (gstin || stateCode));
  const summaryItems = [
    legalName && { label: 'Company', value: legalName },
    gstin && { label: 'GSTIN', value: gstin },
    selectedState && { label: 'State', value: selectedState.label },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <form onSubmit={handleNext} className="space-y-5">
      {hasSignupData && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">From your registration</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {summaryItems.map((item) => (
                  <div key={item.label} className="text-xs">
                    <dt className="inline text-green-700 dark:text-green-300">{item.label}: </dt>
                    <dd className="inline font-medium text-green-900 dark:text-green-100">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {!hasSignupData && (
        <>
          <Input label="Legal company name" required value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Pvt Ltd" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" helper="15 characters" />
            <Select label="State" options={STATE_SELECT_OPTIONS} value={stateCode} onChange={(e) => setStateCode(e.target.value)} />
          </div>
        </>
      )}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">A few more details to complete your profile:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="PAN" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="AAAAA0000A" helper="Optional · 10 characters" />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
        <Input label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="560001" />
        <Select label="Financial year starts in" options={FY_MONTH_OPTIONS} value={fyMonth} onChange={(e) => setFyMonth(e.target.value)} />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={update.isPending}>Save & continue</Button>
      </div>
    </form>
  );
}

// ─── Bank Account Step ───────────────────────────────────────────────────────

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'current', label: 'Current Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'overdraft', label: 'Overdraft Account' },
  { value: 'cash_credit', label: 'Cash Credit' },
];

export function BankAccountStep({ onComplete, onSkip }: StepProps) {
  const create = useCreateBankAccount();
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountType, setAccountType] = useState<'current' | 'savings' | 'overdraft' | 'cash_credit'>('current');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [error, setError] = useState('');

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !bankName.trim() || !accountNumber.trim() || !ifscCode.trim()) {
      return setError('All fields except opening balance are required');
    }
    try {
      await create.mutateAsync({
        name,
        bankName,
        accountNumber,
        ifscCode: ifscCode.toUpperCase(),
        accountType,
        openingBalance: Number(openingBalance) || 0,
      });
      onComplete();
    } catch {
      setError('Could not create bank account. Check your inputs.');
    }
  }

  return (
    <form onSubmit={handleNext} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Account nickname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Current" />
        <Input label="Bank name" required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank" />
        <Input label="Account number" required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="50100123456789" />
        <Input label="IFSC code" required value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} placeholder="HDFC0001234" />
        <Select label="Account type" required options={ACCOUNT_TYPE_OPTIONS} value={accountType} onChange={(e) => setAccountType(e.target.value as 'current')} />
        <Input label="Opening balance (₹)" type="number" min={0} step={0.01} value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-between pt-2">
        {onSkip && <Button type="button" variant="ghost" onClick={onSkip}>Skip for now</Button>}
        <Button type="submit" loading={create.isPending} className="ml-auto">Save & continue</Button>
      </div>
    </form>
  );
}

// ─── Invoice Settings Step ───────────────────────────────────────────────────

export function InvoiceSettingsStep({ onComplete }: StepProps) {
  const { data: existing } = useInvoiceNumbering();
  const update = useUpdateInvoiceNumbering();
  const [prefix, setPrefix] = useState('INV');
  const [format, setFormat] = useState('{prefix}/{fy}/{seq}');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [error, setError] = useState('');

  useEffect(() => {
    const s = existing?.data;
    if (!s) return;
    setPrefix(s.invoicePrefix ?? 'INV');
    setFormat(s.invoiceFormat ?? '{prefix}/{fy}/{seq}');
  }, [existing]);

  const preview = format
    .replace('{prefix}', prefix || 'INV')
    .replace('{fy}', '26-27')
    .replace('{seq}', '0001');

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!prefix.trim()) return setError('Prefix is required');
    try {
      await update.mutateAsync({
        invoicePrefix: prefix,
        invoiceFormat: format,
        invoiceStartSequence: 1,
      });
      onComplete();
    } catch {
      setError('Could not save invoice settings.');
    }
  }

  return (
    <form onSubmit={handleNext} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Invoice prefix" required value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="INV" />
        <Input label="Default payment terms (days)" type="number" min={0} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
      </div>
      <Input label="Format template" value={format} onChange={(e) => setFormat(e.target.value)} helper="Use {prefix}, {fy}, {seq}" />
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Next invoice will look like</p>
        <p className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">{preview}</p>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={update.isPending}>Save & continue</Button>
      </div>
    </form>
  );
}

// ─── First Customer Step ─────────────────────────────────────────────────────

export function FirstCustomerStep({ onComplete, onSkip }: StepProps) {
  const create = useCreateCustomer();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [error, setError] = useState('');

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Customer name is required');
    try {
      await create.mutateAsync({
        name,
        type: 'b2b',
        email: email || null,
        phone: phone || null,
        gstin: gstin.toUpperCase() || null,
        paymentTermsDays: 30,
      });
      onComplete();
    } catch {
      setError('Could not create customer.');
    }
  }

  return (
    <form onSubmit={handleNext} className="space-y-5">
      <Input label="Customer name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Distributors" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@acme.com" />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
      </div>
      <Input label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-between pt-2">
        {onSkip && <Button type="button" variant="ghost" onClick={onSkip}>Skip for now</Button>}
        <Button type="submit" loading={create.isPending} className="ml-auto">Save & continue</Button>
      </div>
    </form>
  );
}

// ─── First Item Step ─────────────────────────────────────────────────────────

const ITEM_TYPE_OPTIONS = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
];

export function FirstItemStep({ onComplete, onSkip }: StepProps) {
  const create = useCreateItem();
  const [name, setName] = useState('');
  const [type, setType] = useState<'product' | 'service'>('product');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [error, setError] = useState('');

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Item name is required');
    try {
      await create.mutateAsync({
        name,
        type,
        hsnSacCode: hsnSacCode || undefined,
        defaultSellingPrice: defaultSellingPrice ? Number(defaultSellingPrice) : undefined,
        gstRate: gstRate ? Number(gstRate) : undefined,
      });
      onComplete();
    } catch {
      setError('Could not create item.');
    }
  }

  return (
    <form onSubmit={handleNext} className="space-y-5">
      <Input label="Item / service name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Consulting Hour" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Type" options={ITEM_TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value as 'product')} />
        <Input label="HSN / SAC code" value={hsnSacCode} onChange={(e) => setHsnSacCode(e.target.value)} placeholder="998311" />
        <Input label="Default selling price (₹)" type="number" min={0} step={0.01} value={defaultSellingPrice} onChange={(e) => setDefaultSellingPrice(e.target.value)} placeholder="1000" />
        <Input label="GST rate (%)" type="number" min={0} max={28} step={0.01} value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-between pt-2">
        {onSkip && <Button type="button" variant="ghost" onClick={onSkip}>Skip for now</Button>}
        <Button type="submit" loading={create.isPending} className="ml-auto">Save & finish</Button>
      </div>
    </form>
  );
}
