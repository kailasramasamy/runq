import { useState } from 'react';
import { Card, CardHeader, CardContent, Input, Select, Button, Combobox } from '@/components/ui';
import type { Employee } from '@/hooks/queries/use-hr';
import { useDepartments, useDesignations, useEmployees, useNextEmployeeCode } from '@/hooks/queries/use-hr';

interface Props {
  initialData?: Employee;
  onSubmit: (data: any) => void;
  /** Optional partial-save handler. When set, renders a "Save draft" button
   *  alongside the primary submit; it skips client validation and the
   *  cleaner drops optional fields with invalid format (PAN/Aadhaar/IFSC)
   *  so a partially-filled record can still persist. */
  onSaveDraft?: (data: any) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^[0-9]{12}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

type FormState = {
  employeeCode: string; firstName: string; lastName: string;
  email: string; phone: string; dateOfBirth: string;
  gender: '' | 'male' | 'female' | 'other'; bloodGroup: string; address: string;
  joiningDate: string; confirmationDate: string; exitDate: string;
  status: 'active' | 'inactive' | 'terminated' | 'on_leave';
  employmentType: 'permanent' | 'contract' | 'intern' | 'consultant' | 'wage';
  departmentId: string; designationId: string; reportingToId: string;
  pan: string; aadhaar: string; uan: string; pfNumber: string; esiNumber: string;
  bankAccountNumber: string; bankIfsc: string; bankName: string;
  ctcAnnual: string;
  agency: string; dailyWageRate: string;
};

function buildInitial(e?: Employee): FormState {
  return {
    employeeCode: e?.employeeCode ?? '',
    firstName: e?.firstName ?? '',
    lastName: e?.lastName ?? '',
    email: e?.email ?? '',
    phone: e?.phone ?? '',
    dateOfBirth: e?.dateOfBirth ?? '',
    gender: (e?.gender ?? '') as FormState['gender'],
    bloodGroup: e?.bloodGroup ?? '',
    address: e?.address ?? '',
    joiningDate: e?.joiningDate ?? new Date().toISOString().slice(0, 10),
    confirmationDate: e?.confirmationDate ?? '',
    exitDate: e?.exitDate ?? '',
    status: e?.status ?? 'active',
    employmentType: e?.employmentType ?? 'permanent',
    departmentId: e?.departmentId ?? '',
    designationId: e?.designationId ?? '',
    reportingToId: e?.reportingToId ?? '',
    pan: e?.pan ?? '',
    aadhaar: e?.aadhaar ?? '',
    uan: e?.uan ?? '',
    pfNumber: e?.pfNumber ?? '',
    esiNumber: e?.esiNumber ?? '',
    bankAccountNumber: e?.bankAccountNumber ?? '',
    bankIfsc: e?.bankIfsc ?? '',
    bankName: e?.bankName ?? '',
    ctcAnnual: e?.ctcAnnual ?? '',
    agency: (e as any)?.agency ?? '',
    dailyWageRate: (e as any)?.dailyWageRate ?? '',
  };
}

function clean(s: FormState, { partial = false }: { partial?: boolean } = {}) {
  const out: any = { ...s };
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null;
  }
  out.employeeCode = s.employeeCode.trim() || null;
  out.firstName = s.firstName.trim();
  // On a partial save, default the joining date to today so a brand-new
  // draft still satisfies the server's required-on-create column. The user
  // can correct it when they finish the record.
  out.joiningDate = s.joiningDate || (partial ? new Date().toISOString().slice(0, 10) : s.joiningDate);
  out.status = s.status;
  out.employmentType = s.employmentType;
  if (out.gender === null) delete out.gender;
  if (s.ctcAnnual) out.ctcAnnual = Number(s.ctcAnnual);
  else delete out.ctcAnnual;
  if (s.dailyWageRate) out.dailyWageRate = Number(s.dailyWageRate);
  else delete out.dailyWageRate;
  // Drop optional regex'd fields when partial-saving and they don't match —
  // a draft with a half-typed PAN should still save. The full-walk submit
  // path keeps them so the server returns its precise validation error.
  if (partial) {
    if (out.pan && !PAN_RE.test(String(out.pan).toUpperCase())) out.pan = null;
    if (out.aadhaar && !AADHAAR_RE.test(String(out.aadhaar))) out.aadhaar = null;
    if (out.bankIfsc && !IFSC_RE.test(String(out.bankIfsc).toUpperCase())) out.bankIfsc = null;
    if (out.uan && String(out.uan).length !== 12) out.uan = null;
  }
  return out;
}

export function EmployeeForm({ initialData, onSubmit, onSaveDraft, onCancel, isLoading }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitial(initialData));
  const { data: deptData } = useDepartments();
  const { data: desigData } = useDesignations();
  // Active employees power the reporting-manager picker. 200 is the server's
  // hard cap on this filter — asking for more 400s and leaves the Combobox
  // empty, which is worse than a page that covers any SME headcount.
  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  // Only on create — an existing record already has its code.
  const { data: nextCode } = useNextEmployeeCode(!initialData);
  const suggestedCode = nextCode?.data.employeeCode;

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(clean(form));
  }

  const deptOptions = (deptData?.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const desigOptions = (desigData?.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  // Exclude the employee being edited so they can't report to themselves.
  const managerOptions = (empData?.data ?? [])
    .filter((emp) => emp.id !== initialData?.id)
    .map((emp) => ({
      value: emp.id,
      label: `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ''} (${emp.employeeCode})`,
    }));
  // Keep the currently-assigned manager selectable + labelled even if they're
  // inactive or outside the fetched page — otherwise the Combobox falls back
  // to showing the raw id. Uses the name the detail endpoint already returns.
  if (
    initialData?.reportingToId &&
    !managerOptions.some((o) => o.value === initialData.reportingToId)
  ) {
    managerOptions.unshift({
      value: initialData.reportingToId,
      label: initialData.reportingToName ?? initialData.reportingToId,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>Basic details</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label={initialData ? 'Employee code *' : 'Employee code'}
              value={form.employeeCode}
              onChange={(e) => up('employeeCode', e.target.value)}
              required={!!initialData}
              placeholder={suggestedCode ? `Auto: ${suggestedCode}` : undefined}
            />
            <Select
              label="Employment type *"
              options={[
                { value: 'permanent', label: 'Permanent' },
                { value: 'contract', label: 'Contract' },
                { value: 'wage', label: 'Wage' },
                { value: 'intern', label: 'Intern' },
                { value: 'consultant', label: 'Consultant' },
              ]}
              value={form.employmentType}
              onChange={(e) => up('employmentType', e.target.value as any)}
            />
            <Input label="First name *" value={form.firstName} onChange={(e) => up('firstName', e.target.value)} required />
            <Input label="Last name" value={form.lastName} onChange={(e) => up('lastName', e.target.value)} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => up('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={(e) => up('phone', e.target.value)} />
            <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => up('dateOfBirth', e.target.value)} />
            <Select
              label="Gender"
              options={[
                { value: '', label: '—' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
              value={form.gender}
              onChange={(e) => up('gender', e.target.value as any)}
            />
            <Input label="Blood group" value={form.bloodGroup} onChange={(e) => up('bloodGroup', e.target.value)} />
            <Input label="Address" value={form.address} onChange={(e) => up('address', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Employment</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Joining date *" type="date" value={form.joiningDate} onChange={(e) => up('joiningDate', e.target.value)} required />
            <Input label="Confirmation date" type="date" value={form.confirmationDate} onChange={(e) => up('confirmationDate', e.target.value)} />
            <Combobox
              label="Department"
              options={[{ value: '', label: '— None —' }, ...deptOptions]}
              value={form.departmentId}
              onChange={(v) => up('departmentId', v)}
            />
            <Combobox
              label="Designation"
              options={[{ value: '', label: '— None —' }, ...desigOptions]}
              value={form.designationId}
              onChange={(v) => up('designationId', v)}
            />
            <Combobox
              label="Reporting manager"
              options={[{ value: '', label: '— None —' }, ...managerOptions]}
              value={form.reportingToId}
              onChange={(v) => up('reportingToId', v)}
            />
            <Select
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'on_leave', label: 'On leave' },
                { value: 'terminated', label: 'Terminated' },
              ]}
              value={form.status}
              onChange={(e) => up('status', e.target.value as any)}
            />
            {initialData && (
              <Input label="Exit date" type="date" value={form.exitDate} onChange={(e) => up('exitDate', e.target.value)} />
            )}
            {/* Most Indian SME hires happen with a monthly number on the
                table, so give the user a monthly input that auto-syncs to
                the annual CTC (the DB column). Either field can drive the
                other — typing in monthly fills annual = monthly × 12; typing
                in annual fills monthly = annual / 12 (rounded). */}
            <Input
              label="Monthly salary (₹)"
              type="number" min="0" step="1"
              value={form.ctcAnnual ? String(Math.round(Number(form.ctcAnnual) / 12)) : ''}
              onChange={(e) => {
                const monthly = e.target.value;
                up('ctcAnnual', monthly === '' ? '' : String(Number(monthly) * 12));
              }}
              helper="What the employee sees per month. Annual CTC updates automatically."
            />
            <Input
              label="Annual CTC (₹)"
              type="number" min="0" step="1"
              value={form.ctcAnnual}
              onChange={(e) => up('ctcAnnual', e.target.value)}
              helper="Total cost to company per year."
            />
            <Input label="Daily wage rate (₹)" type="number" min="0" step="1" value={form.dailyWageRate} onChange={(e) => up('dailyWageRate', e.target.value)} helper="For wage/contract workers — used by wage register" />
            <Input label="Contractor agency" value={form.agency} onChange={(e) => up('agency', e.target.value)} helper="For contract labour through an agency" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Statutory</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="PAN" maxLength={10} value={form.pan} onChange={(e) => up('pan', e.target.value.toUpperCase())} />
            <Input label="Aadhaar" maxLength={12} value={form.aadhaar} onChange={(e) => up('aadhaar', e.target.value)} />
            <Input label="UAN" maxLength={12} value={form.uan} onChange={(e) => up('uan', e.target.value)} />
            <Input label="PF number" value={form.pfNumber} onChange={(e) => up('pfNumber', e.target.value)} />
            <Input label="ESI number" value={form.esiNumber} onChange={(e) => up('esiNumber', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Bank</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Bank account number" value={form.bankAccountNumber} onChange={(e) => up('bankAccountNumber', e.target.value)} />
            <Input label="IFSC" maxLength={11} value={form.bankIfsc} onChange={(e) => up('bankIfsc', e.target.value.toUpperCase())} />
            <Input label="Bank name" value={form.bankName} onChange={(e) => up('bankName', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        {onSaveDraft && (
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || !form.firstName.trim() || (!!initialData && !form.employeeCode.trim())}
            onClick={() => onSaveDraft(clean(form, { partial: true }))}
            title="Save what you have now — finish details anytime"
          >
            Save draft
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving…' : initialData ? 'Save changes' : 'Create employee'}</Button>
      </div>
    </form>
  );
}
