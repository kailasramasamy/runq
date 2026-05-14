import { useState } from 'react';
import { Card, CardHeader, CardContent, Input, Select, Button, Combobox } from '@/components/ui';
import type { Employee } from '@/hooks/queries/use-hr';
import { useDepartments, useDesignations } from '@/hooks/queries/use-hr';

interface Props {
  initialData?: Employee;
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

type FormState = {
  employeeCode: string; firstName: string; lastName: string;
  email: string; phone: string; dateOfBirth: string;
  gender: '' | 'male' | 'female' | 'other'; bloodGroup: string; address: string;
  joiningDate: string; confirmationDate: string; exitDate: string;
  status: 'active' | 'inactive' | 'terminated' | 'on_leave';
  employmentType: 'permanent' | 'contract' | 'intern' | 'consultant' | 'wage';
  departmentId: string; designationId: string;
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

function clean(s: FormState) {
  const out: any = { ...s };
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null;
  }
  out.employeeCode = s.employeeCode.trim();
  out.firstName = s.firstName.trim();
  out.joiningDate = s.joiningDate;
  out.status = s.status;
  out.employmentType = s.employmentType;
  if (out.gender === null) delete out.gender;
  if (s.ctcAnnual) out.ctcAnnual = Number(s.ctcAnnual);
  else delete out.ctcAnnual;
  if (s.dailyWageRate) out.dailyWageRate = Number(s.dailyWageRate);
  else delete out.dailyWageRate;
  return out;
}

export function EmployeeForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitial(initialData));
  const { data: deptData } = useDepartments();
  const { data: desigData } = useDesignations();

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(clean(form));
  }

  const deptOptions = (deptData?.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const desigOptions = (desigData?.data ?? []).map((d) => ({ value: d.id, label: d.name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>Basic details</CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Employee code *" value={form.employeeCode} onChange={(e) => up('employeeCode', e.target.value)} required />
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
            <Input label="CTC (annual ₹)" type="number" min="0" step="1" value={form.ctcAnnual} onChange={(e) => up('ctcAnnual', e.target.value)} />
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
        <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving…' : initialData ? 'Save changes' : 'Create employee'}</Button>
      </div>
    </form>
  );
}
