import { useState, useEffect } from 'react';
import { Building2, ShieldCheck, QrCode, Landmark, PenLine, Upload, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  PageHeader,
  Button,
  Input,
  Select,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import { useCompanySettings, useUpdateCompanySettings } from '@/hooks/queries/use-settings';
import { useToast } from '@/components/ui';
import { INDIAN_STATE_OPTIONS } from '@/lib/indian-states';
import { INDUSTRY_LIST, type Industry } from '@runq/validators';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess } from '@runq/types';

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

type TabId = 'general' | 'gst' | 'payroll' | 'upi' | 'hr-letters';

const COMPANY_TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'gst', label: 'GST Profile' },
  { id: 'payroll', label: 'Payroll Statutory' },
  { id: 'upi', label: 'UPI Collection' },
  { id: 'hr-letters', label: 'HR Letters' },
];

/**
 * Inline toggle row for a statutory component (PF / EPS / PT / TDS).
 * Keeps the component count low — no shared Switch primitive exists yet, and a
 * native checkbox styled as a switch is enough for this single use site.
 */
function StatutoryToggle(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 cursor-pointer select-none ${
        props.disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 rounded border-zinc-300"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {props.label}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {props.description}
        </span>
      </span>
    </label>
  );
}

export function CompanySettingsPage() {
  const { data, isLoading } = useCompanySettings();
  const update = useUpdateCompanySettings();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [fyMonth, setFyMonth] = useState('4');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [industry, setIndustry] = useState<string>('');
  const [savedIndustry, setSavedIndustry] = useState<string>('');
  const [gstin, setGstin] = useState('');
  const [gstUsername, setGstUsername] = useState('');
  const [gstAuthSignatoryPan, setGstAuthSignatoryPan] = useState('');
  const [legalName, setLegalName] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [defaultMargin, setDefaultMargin] = useState('');
  const [autoDispatchOnInvoice, setAutoDispatchOnInvoice] = useState(false);
  const [gstFilingStart, setGstFilingStart] = useState(''); // YYYY-MM for the input
  const [esiRegistrationNumber, setEsiRegistrationNumber] = useState('');
  const [pfEstablishmentCode, setPfEstablishmentCode] = useState('');
  const [ptRegistrationNumber, setPtRegistrationNumber] = useState('');
  const [tan, setTan] = useState('');
  const [hrSignatoryName, setHrSignatoryName] = useState('');
  const [hrSignatoryDesignation, setHrSignatoryDesignation] = useState('');
  const [hrSignatoryEmail, setHrSignatoryEmail] = useState('');
  const [hrSignatureImageUrl, setHrSignatureImageUrl] = useState('');
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [localSignaturePreview, setLocalSignaturePreview] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  // Statutory toggles — payroll runs skip the corresponding component when off.
  // Default each to true; an existing tenant with the field undefined keeps the
  // legacy "everything enabled" behaviour.
  const [payrollPfEnabled, setPayrollPfEnabled] = useState(true);
  const [payrollEpsEnabled, setPayrollEpsEnabled] = useState(true);
  const [payrollPtEnabled, setPayrollPtEnabled] = useState(true);
  const [payrollTdsEnabled, setPayrollTdsEnabled] = useState(true);

  useEffect(() => {
    if (data?.data) {
      setFyMonth(String(data.data.financialYearStartMonth ?? 4));
      setPaymentTerms(String(data.data.defaultPaymentTermsDays ?? 30));
      setIndustry(data.data.industry ?? '');
      setSavedIndustry(data.data.industry ?? '');
      setGstin(data.data.gstin ?? '');
      setGstUsername(data.data.gstUsername ?? '');
      setGstAuthSignatoryPan(data.data.gstAuthSignatoryPan ?? '');
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
      setAutoDispatchOnInvoice(data.data.autoDispatchOnInvoice === true);
      // MMYYYY → YYYY-MM for the month input
      const sp = data.data.gstFilingStartPeriod;
      if (sp && sp.length === 6) {
        setGstFilingStart(`${sp.substring(2)}-${sp.substring(0, 2)}`);
      } else {
        setGstFilingStart('');
      }
      setEsiRegistrationNumber(data.data.esiRegistrationNumber ?? '');
      setPfEstablishmentCode(data.data.pfEstablishmentCode ?? '');
      setPtRegistrationNumber(data.data.ptRegistrationNumber ?? '');
      setTan(data.data.tan ?? '');
      const sig = (data.data as any).hrSignatory ?? {};
      setHrSignatoryName(sig.name ?? '');
      setHrSignatoryDesignation(sig.designation ?? '');
      setHrSignatoryEmail(sig.email ?? '');
      setHrSignatureImageUrl(sig.signatureImageUrl ?? '');
      setCompanyLogoUrl((data.data as any).companyLogoUrl ?? '');
      setPayrollPfEnabled((data.data as any).payrollPfEnabled !== false);
      setPayrollEpsEnabled((data.data as any).payrollEpsEnabled !== false);
      setPayrollPtEnabled((data.data as any).payrollPtEnabled !== false);
      setPayrollTdsEnabled((data.data as any).payrollTdsEnabled !== false);
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
        gstAuthSignatoryPan: gstAuthSignatoryPan ? gstAuthSignatoryPan.toUpperCase() : null,
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
        autoDispatchOnInvoice,
        // YYYY-MM → MMYYYY
        gstFilingStartPeriod: gstFilingStart
          ? `${gstFilingStart.substring(5, 7)}${gstFilingStart.substring(0, 4)}`
          : null,
        esiRegistrationNumber: esiRegistrationNumber || null,
        pfEstablishmentCode: pfEstablishmentCode || null,
        ptRegistrationNumber: ptRegistrationNumber || null,
        tan: tan ? tan.toUpperCase() : null,
        companyLogoUrl: companyLogoUrl || null,
        hrSignatory: {
          name: hrSignatoryName || null,
          designation: hrSignatoryDesignation || null,
          email: hrSignatoryEmail || null,
          signatureImageUrl: hrSignatureImageUrl || null,
        },
        payrollPfEnabled,
        payrollEpsEnabled,
        payrollPtEnabled,
        payrollTdsEnabled,
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

      <Tabs<TabId> active={activeTab} onChange={setActiveTab} tabs={COMPANY_TABS} />

      {/* All tabs share one form + state, so switching tabs never drops edits;
          Save Changes persists every section regardless of which tab is open. */}
      <form onSubmit={handleSave}>
        {/* ─── General ─── */}
        {activeTab === 'general' && (
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

              <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <StatutoryToggle
                  label="Dispatch stock when an invoice is issued"
                  description="Raises and posts the delivery note automatically, picking batches FEFO — for businesses that ship what they bill the same day. Issuing never fails on stock: if the warehouse can't cover a line, the invoice still goes out and a draft delivery note is left in Inventory › Sales dispatch. Off means stock moves only when you confirm it there."
                  checked={autoDispatchOnInvoice}
                  onChange={setAutoDispatchOnInvoice}
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
        )}

        {/* ─── GST Profile ─── */}
        {activeTab === 'gst' && (
          <Card className="max-w-xl">
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
                label="Authorized Signatory PAN"
                value={gstAuthSignatoryPan}
                onChange={(e) => setGstAuthSignatoryPan(e.target.value.toUpperCase())}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                helper="PAN of the partner/director registered as authorized signatory on the GST portal. Required for EVC OTP. Often differs from the firm PAN embedded in the GSTIN."
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
        )}

        {/* ─── Payroll Statutory ─── */}
        {activeTab === 'payroll' && (
          <Card className="max-w-xl">
            <CardContent className="space-y-5 pt-5">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <Landmark size={16} />
                <span>Payroll Statutory</span>
              </div>

              <Input
                label="ESI Registration Number"
                value={esiRegistrationNumber}
                onChange={(e) => setEsiRegistrationNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="17-digit ESIC employer code"
                maxLength={17}
                helper="Printed on the monthly ESI challan and return."
              />

              <Input
                label="PF Establishment Code"
                value={pfEstablishmentCode}
                onChange={(e) => setPfEstablishmentCode(e.target.value)}
                placeholder="e.g. KNRGN0012345000"
                maxLength={30}
                helper="EPFO establishment code shown on the PF challan."
              />

              <Input
                label="Professional Tax Registration Number"
                value={ptRegistrationNumber}
                onChange={(e) => setPtRegistrationNumber(e.target.value)}
                placeholder="State PT enrolment number"
                maxLength={30}
                helper="State-issued Professional Tax enrolment / registration number."
              />

              <Input
                label="TAN"
                value={tan}
                onChange={(e) => setTan(e.target.value.toUpperCase())}
                placeholder="e.g. BLRC12345D"
                maxLength={10}
                helper="Tax Deduction Account Number — used on Form 24Q for payroll TDS."
              />

              {/* Statutory toggles — when off, payroll runs skip the component
                  entirely (no payslip line, no challan, no JE posting). */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 pt-3">
                  Components Applied to Payroll Runs
                </div>
                <StatutoryToggle
                  label="Provident Fund (PF)"
                  description="12% employee + 12% employer contribution on PF wages."
                  checked={payrollPfEnabled}
                  onChange={setPayrollPfEnabled}
                />
                <StatutoryToggle
                  label="Employee Pension Scheme (EPS)"
                  description="Diverts 8.33% of employer PF to A/c 10. Turn off for ₹15k+ joiners after Sep 2014 — full 12% then goes to A/c 1."
                  checked={payrollEpsEnabled}
                  onChange={setPayrollEpsEnabled}
                  disabled={!payrollPfEnabled}
                />
                <StatutoryToggle
                  label="Professional Tax (PT)"
                  description="State-levied monthly deduction; slabs depend on the establishment's state."
                  checked={payrollPtEnabled}
                  onChange={setPayrollPtEnabled}
                />
                <StatutoryToggle
                  label="TDS on Salary"
                  description="Monthly tax deduction projected from new-regime annual liability."
                  checked={payrollTdsEnabled}
                  onChange={setPayrollTdsEnabled}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Building2 size={14} />
                <span>Appears on payroll challans and statutory returns.</span>
              </div>
              <Button type="submit" loading={update.isPending}>
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* ─── UPI Collection ─── */}
        {activeTab === 'upi' && (
          <Card className="max-w-xl">
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
        )}

        {/* ─── HR Letters ─── */}
        {activeTab === 'hr-letters' && (
          <Card className="max-w-xl">
            <CardContent className="space-y-5 pt-5">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <Building2 size={16} />
                <span>Company logo</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-3">
                Appears in the header of every letter PDF. PNG/JPG/WEBP/SVG, max 2 MB. Transparent background recommended.
              </p>
              {companyLogoUrl && (
                <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 bg-white">
                  <ImagePreview key={companyLogoUrl} endpoint="/api/v1/hr/company-logo" localUrl={localLogoPreview} maxH={20} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="inline-flex">
                  <span className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <Upload className="h-4 w-4" />
                    {uploadingLogo ? 'Uploading…' : companyLogoUrl ? 'Replace logo' : 'Upload logo'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (localLogoPreview) URL.revokeObjectURL(localLogoPreview);
                      setLocalLogoPreview(URL.createObjectURL(file));
                      setUploadingLogo(true);
                      try {
                        const form = new FormData();
                        form.append('file', file);
                        const out = await api.upload<ApiSuccess<{ storageKey: string }>>(
                          '/hr/company-logo',
                          form,
                        );
                        setCompanyLogoUrl(out.data.storageKey);
                        toast('Logo uploaded — save changes to apply', 'success');
                      } catch (err: any) {
                        toast(err?.message ?? 'Upload failed', 'error');
                      } finally {
                        setUploadingLogo(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {companyLogoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyLogoUrl('');
                      if (localLogoPreview) { URL.revokeObjectURL(localLogoPreview); setLocalLogoPreview(null); }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />Remove
                  </button>
                )}
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-700 -mx-6 my-2" />

              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <PenLine size={16} />
                <span>HR Signatory</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-3">
                Printed at the bottom of every letter issued from runq (offer, experience, salary certificate, address proof, etc.).
              </p>

              <Input
                label="Signatory Name"
                value={hrSignatoryName}
                onChange={(e) => setHrSignatoryName(e.target.value)}
                placeholder="e.g. Priya Menon"
                helper="Full name as it should appear under the signature line."
              />
              <Input
                label="Designation"
                value={hrSignatoryDesignation}
                onChange={(e) => setHrSignatoryDesignation(e.target.value)}
                placeholder="e.g. Head of Human Resources"
              />
              <Input
                label="Signatory Email (optional)"
                type="email"
                value={hrSignatoryEmail}
                onChange={(e) => setHrSignatoryEmail(e.target.value)}
                placeholder="hr@company.com"
                helper="Used in 'reply to' on letter emails when implemented."
              />

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Signature Image
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Upload a PNG/JPG (max 2 MB) of the signatory's handwritten signature on a clean background. Used when rendering letters as PDFs.
                </p>
                {hrSignatureImageUrl && (
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 bg-white">
                    <SignaturePreview key={hrSignatureImageUrl} localUrl={localSignaturePreview} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="inline-flex">
                    <span className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <Upload className="h-4 w-4" />
                      {uploadingSignature ? 'Uploading…' : hrSignatureImageUrl ? 'Replace signature' : 'Upload signature'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingSignature}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Show the picked file immediately — the server preview
                        // endpoint only serves the *saved* signature, so we
                        // skip a roundtrip and just render the local blob.
                        if (localSignaturePreview) URL.revokeObjectURL(localSignaturePreview);
                        setLocalSignaturePreview(URL.createObjectURL(file));
                        setUploadingSignature(true);
                        try {
                          const form = new FormData();
                          form.append('file', file);
                          const out = await api.upload<ApiSuccess<{ storageKey: string }>>(
                            '/hr/signature-image',
                            form,
                          );
                          setHrSignatureImageUrl(out.data.storageKey);
                          toast('Signature uploaded — save changes to apply', 'success');
                        } catch (err: any) {
                          toast(err?.message ?? 'Upload failed', 'error');
                        } finally {
                          setUploadingSignature(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {hrSignatureImageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setHrSignatureImageUrl('');
                        if (localSignaturePreview) {
                          URL.revokeObjectURL(localSignaturePreview);
                          setLocalSignaturePreview(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <PenLine size={14} />
                <span>Used on every letter issued from runq.</span>
              </div>
              <Button type="submit" loading={update.isPending}>
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        )}
      </form>
    </div>
  );
}

function ImagePreview({
  endpoint, localUrl, maxH = 20,
}: { endpoint: string; localUrl: string | null; maxH?: number }) {
  const [src, setSrc] = useState<string | null>(localUrl);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (localUrl) { setSrc(localUrl); setMissing(false); return; }
    let cancelled = false;
    let revokedUrl: string | null = null;
    async function load() {
      const res = await fetch(endpoint, { headers: api.authHeaders() });
      if (!res.ok) { if (!cancelled) setMissing(true); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      revokedUrl = url;
      if (!cancelled) setSrc(url);
    }
    load();
    return () => { cancelled = true; if (revokedUrl) URL.revokeObjectURL(revokedUrl); };
  }, [localUrl, endpoint]);
  if (src) return <img src={src} alt="" className={`max-w-full object-contain max-h-${maxH}`} style={{ maxHeight: `${maxH * 4}px` }} />;
  if (missing) return <div className="h-16 flex items-center text-xs text-zinc-500">Click "Save Changes" to apply your upload.</div>;
  return <div className="h-16 flex items-center text-xs text-zinc-400">Loading preview…</div>;
}

function SignaturePreview({ localUrl }: { localUrl: string | null }) {
  return <ImagePreview endpoint="/api/v1/hr/signature-image" localUrl={localUrl} maxH={20} />;
}
