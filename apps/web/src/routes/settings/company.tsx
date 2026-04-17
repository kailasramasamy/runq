import { useState, useEffect } from 'react';
import { Building2, ShieldCheck, QrCode } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  PageHeader,
  Button,
  Input,
  Select,
} from '@/components/ui';
import { useCompanySettings, useUpdateCompanySettings } from '@/hooks/queries/use-settings';
import { useToast } from '@/components/ui';
import { INDIAN_STATE_OPTIONS } from '@/lib/indian-states';
import { INDUSTRY_LIST, type Industry } from '@runq/validators';
import { useQueryClient } from '@tanstack/react-query';

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const INDUSTRY_OPTIONS = [
  { value: '', label: 'Select industry…' },
  ...INDUSTRY_LIST.map((i) => ({ value: i, label: i })),
];

const PAYMENT_TERMS_OPTIONS = [
  { value: '0', label: 'Due immediately' },
  { value: '7', label: 'Net 7 days' },
  { value: '15', label: 'Net 15 days' },
  { value: '30', label: 'Net 30 days' },
  { value: '45', label: 'Net 45 days' },
  { value: '60', label: 'Net 60 days' },
  { value: '90', label: 'Net 90 days' },
];

export function CompanySettingsPage() {
  const { data, isLoading } = useCompanySettings();
  const update = useUpdateCompanySettings();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [fyMonth, setFyMonth] = useState('4');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [industry, setIndustry] = useState<string>('');
  const [savedIndustry, setSavedIndustry] = useState<string>('');
  const [gstin, setGstin] = useState('');
  const [gstUsername, setGstUsername] = useState('');
  const [legalName, setLegalName] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [defaultMargin, setDefaultMargin] = useState('');
  const [gstFilingStart, setGstFilingStart] = useState(''); // YYYY-MM for the input

  useEffect(() => {
    if (data?.data) {
      setFyMonth(String(data.data.financialYearStartMonth ?? 4));
      setPaymentTerms(String(data.data.defaultPaymentTermsDays ?? 30));
      setIndustry(data.data.industry ?? '');
      setSavedIndustry(data.data.industry ?? '');
      setGstin(data.data.gstin ?? '');
      setGstUsername(data.data.gstUsername ?? '');
      setLegalName(data.data.legalName ?? '');
      setState(data.data.state ?? '');
      setStateCode(data.data.stateCode ?? '');
      setAddressLine1(data.data.addressLine1 ?? '');
      setAddressLine2(data.data.addressLine2 ?? '');
      setCity(data.data.city ?? '');
      setPincode(data.data.pincode ?? '');
      setUpiId(data.data.upiId ?? '');
      setDefaultMargin(
        data.data.defaultMarginPercent != null
          ? String(data.data.defaultMarginPercent)
          : '',
      );
      // MMYYYY → YYYY-MM for the month input
      const sp = data.data.gstFilingStartPeriod;
      if (sp && sp.length === 6) {
        setGstFilingStart(`${sp.substring(2)}-${sp.substring(0, 2)}`);
      } else {
        setGstFilingStart('');
      }
    }
  }, [data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // Warn before wiping a customized catalogue schema. We can't tell from
    // here whether the tenant has customized, so any real industry change
    // shows the warning — better too many prompts than silent data loss.
    const industryChanging = industry !== savedIndustry;
    if (industryChanging && savedIndustry) {
      const ok = window.confirm(
        `Changing industry from "${savedIndustry}" to "${industry || 'None'}" will reset your Catalogue Attributes to the new industry's defaults. Any custom fields you've added will be removed. Continue?`,
      );
      if (!ok) return;
    }
    try {
      await update.mutateAsync({
        currency: 'INR',
        financialYearStartMonth: Number(fyMonth),
        defaultPaymentTermsDays: Number(paymentTerms),
        industry: industry ? (industry as Industry) : null,
        gstin: gstin || null,
        gstUsername: gstUsername || null,
        legalName: legalName || null,
        state: state || null,
        stateCode: stateCode || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        pincode: pincode || null,
        upiId: upiId || null,
        defaultMarginPercent:
          defaultMargin.trim() === '' ? null : Number(defaultMargin),
        // YYYY-MM → MMYYYY
        gstFilingStartPeriod: gstFilingStart
          ? `${gstFilingStart.substring(5, 7)}${gstFilingStart.substring(0, 4)}`
          : null,
      });
      // If industry changed, the backend wiped itemAttributeSchema server-side.
      // Invalidate the frontend cache for both the schema query and any cached
      // items so the new preset shows up immediately on the item form / list.
      if (industryChanging) {
        qc.invalidateQueries({ queryKey: ['items'] });
      }
      setSavedIndustry(industry);
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Company Settings"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Company' }]}
        description="Configure your company's financial preferences."
      />

      <form onSubmit={handleSave}>
        <Card className="max-w-xl">
          <CardContent className="space-y-5 pt-5">
            {/* Company Name (read-only) */}
            <Input
              label="Company Name"
              value={isLoading ? '—' : (data?.data?.name ?? '')}
              readOnly
              disabled
              helper="Contact support to change your company name."
            />

            {/* Currency */}
            <Input
              label="Currency"
              value="INR — Indian Rupee (₹)"
              readOnly
              disabled
              helper="Currency is fixed to INR for this tenant."
            />

            {/* Financial Year Start */}
            <Select
              label="Financial Year Start Month"
              value={fyMonth}
              onChange={(e) => setFyMonth(e.target.value)}
              options={MONTH_OPTIONS}
              helper="The month your financial year begins. Default: April (India)."
            />

            {/* Default Payment Terms */}
            <Select
              label="Default Payment Terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              options={PAYMENT_TERMS_OPTIONS}
              helper="Applied to new bills and invoices by default."
            />

            {/* Industry — drives the Catalogue Attributes preset on the items master. */}
            <Select
              label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              options={INDUSTRY_OPTIONS}
              helper="Determines the default fields under Catalogue Details on each item. Changing this resets your Catalogue Attributes to the new industry's defaults."
            />

            {/* Default Margin % — used by Items Smart Import */}
            <Input
              label="Default Margin %"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={defaultMargin}
              onChange={(e) => setDefaultMargin(e.target.value)}
              placeholder="e.g. 30"
              helper="Used by Items › Smart Import when the source row has no margin value. Leave blank to skip."
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Building2 size={14} />
              <span>Changes apply to all new documents.</span>
            </div>
            <Button type="submit" loading={update.isPending}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>

        {/* GST Profile Section */}
        <Card className="mt-6 max-w-xl">
          <CardContent className="space-y-5 pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <ShieldCheck size={16} />
              <span>GST Profile</span>
            </div>

            <Input
              label="GSTIN"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 27AABCU9603R1ZM"
              maxLength={15}
              helper="Your company's GST registration number. Used for invoices and Tally export."
            />

            <Input
              label="GST Portal Username"
              value={gstUsername}
              onChange={(e) => setGstUsername(e.target.value)}
              placeholder="Your gst.gov.in login username"
              helper="Auto-populated when authenticating to file GSTR-1 / GSTR-3B."
            />

            <Input
              label="GST Filing Start Period"
              type="month"
              value={gstFilingStart}
              onChange={(e) => setGstFilingStart(e.target.value)}
              className="dark:[color-scheme:dark]"
              helper="First month runq manages GST filing. Earlier periods are treated as filed externally (e.g. by your CA)."
            />

            <Input
              label="Legal / Trade Name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Registered business name"
            />

            <Select
              label="State"
              value={stateCode}
              onChange={(e) => {
                setStateCode(e.target.value);
                const selected = INDIAN_STATE_OPTIONS.find((s) => s.value === e.target.value);
                if (selected) setState(selected.label);
              }}
              options={[{ value: '', label: 'Select state…' }, ...INDIAN_STATE_OPTIONS]}
              helper="State of GST registration. Determines inter/intra-state tax on invoices."
            />

            <Input
              label="Address Line 1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Building, street"
            />

            <Input
              label="Address Line 2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Area, landmark"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <Input
                label="Pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                maxLength={6}
                placeholder="e.g. 400001"
              />
            </div>

          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Building2 size={14} />
              <span>Changes apply to all new documents.</span>
            </div>
            <Button type="submit" loading={update.isPending}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>

        {/* UPI Collection Section */}
        <Card className="mt-6 max-w-xl">
          <CardContent className="space-y-5 pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <QrCode size={16} />
              <span>UPI Collection</span>
            </div>

            <Input
              label="UPI ID"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value.toLowerCase())}
              placeholder="e.g. yourcompany@hdfcbank"
              helper="Used for UPI payment links on invoices and customer portal."
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Building2 size={14} />
              <span>Appears on invoices and customer portal.</span>
            </div>
            <Button type="submit" loading={update.isPending}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
