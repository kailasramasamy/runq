import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type ComponentType = 'earning' | 'deduction' | 'reimbursement' | 'statutory';
export type CalcType = 'fixed' | 'percent_of_basic' | 'percent_of_ctc' | 'formula';
export type PayrollRunStatus = 'draft' | 'processed' | 'approved' | 'closed';

export interface SalaryComponent {
  id: string;
  name: string; code: string;
  type: ComponentType; calcType: CalcType;
  defaultValue: string;
  isTaxable: boolean; isPfApplicable: boolean; isEsiApplicable: boolean;
  displayOrder: number; isActive: boolean;
}

export interface SalaryStructure {
  id: string; name: string; description: string | null; isActive: boolean;
  components?: Array<{ id: string; salaryComponentId: string; value: string; calcType: CalcType; code: string; name: string; type: ComponentType }>;
}

export interface EmployeeSalary {
  id: string; employeeId: string; salaryStructureId: string | null;
  ctcAnnual: string; effectiveFrom: string; effectiveTo: string | null;
  componentsSnapshot: Array<{ componentId: string; code: string; name: string; type: string; calcType: string; value: number }>;
}

export interface PayrollRun {
  id: string; month: number; year: number; status: PayrollRunStatus;
  totalEmployees: number; totalGross: string; totalDeductions: string; totalNet: string;
  processedAt: string | null; approvedAt: string | null; notes: string | null;
}

export interface Payslip {
  id: string; payrollRunId: string; employeeId: string;
  workingDays: string; presentDays: string; lopDays: string; paidDays: string; otHours: string;
  earnings: Array<{ code: string; name: string; amount: number }>;
  deductions: Array<{ code: string; name: string; amount: number }>;
  gross: string; totalDeductions: string; netPay: string;
  pfEmployee: string; pfEmployer: string; esiEmployee: string; esiEmployer: string;
  tds: string; pt: string;
  employeeCode: string; employeeName: string;
}

// ─── Keys ─────────────────────────────────────────────────────────────────

export const PR_KEYS = {
  components: ['hr', 'payroll', 'components'] as const,
  structures: ['hr', 'payroll', 'structures'] as const,
  structure: (id: string) => ['hr', 'payroll', 'structures', id] as const,
  empSalaries: (employeeId: string) => ['hr', 'payroll', 'emp-salaries', employeeId] as const,
  runs: ['hr', 'payroll', 'runs'] as const,
  run: (id: string) => ['hr', 'payroll', 'runs', id] as const,
  payslips: (id: string) => ['hr', 'payroll', 'runs', id, 'payslips'] as const,
  payslip: (id: string, psid: string) => ['hr', 'payroll', 'runs', id, 'payslips', psid] as const,
};

// ─── Salary components ────────────────────────────────────────────────────

export function useSalaryComponents() {
  return useQuery({
    queryKey: PR_KEYS.components,
    queryFn: () => api.get<ApiSuccess<SalaryComponent[]>>(`/hr/salary-components`),
  });
}
export function useCreateSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<SalaryComponent>>(`/hr/salary-components`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.components }),
  });
}
export function useUpdateSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<SalaryComponent>>(`/hr/salary-components/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.components }),
  });
}
export function useDeleteSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<SalaryComponent>>(`/hr/salary-components/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.components }),
  });
}
export function useSeedDefaultComponents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiSuccess<{ skipped: boolean; count: number }>>(`/hr/salary-components/seed-defaults`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.components }),
  });
}

// ─── Salary structures ────────────────────────────────────────────────────

export function useSalaryStructures() {
  return useQuery({
    queryKey: PR_KEYS.structures,
    queryFn: () => api.get<ApiSuccess<SalaryStructure[]>>(`/hr/salary-structures`),
  });
}
export function useSalaryStructure(id: string | null) {
  return useQuery({
    queryKey: PR_KEYS.structure(id!),
    queryFn: () => api.get<ApiSuccess<SalaryStructure>>(`/hr/salary-structures/${id}`),
    enabled: !!id,
  });
}
export function useCreateSalaryStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<SalaryStructure>>(`/hr/salary-structures`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.structures }),
  });
}
export function useUpdateSalaryStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<SalaryStructure>>(`/hr/salary-structures/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'payroll', 'structures'] }),
  });
}
export function useDeleteSalaryStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<SalaryStructure>>(`/hr/salary-structures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.structures }),
  });
}

// ─── Employee salaries ────────────────────────────────────────────────────

export function useEmployeeSalaries(employeeId: string | null) {
  return useQuery({
    queryKey: PR_KEYS.empSalaries(employeeId!),
    queryFn: () => api.get<ApiSuccess<EmployeeSalary[]>>(`/hr/employee-salaries?employeeId=${employeeId}`),
    enabled: !!employeeId,
  });
}
export function useAssignEmployeeSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { employeeId: string; salaryStructureId?: string | null; ctcAnnual: number; effectiveFrom: string }) =>
      api.post<ApiSuccess<EmployeeSalary>>(`/hr/employee-salaries`, d),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: PR_KEYS.empSalaries(vars.employeeId) });
      qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
    },
  });
}

// ─── Payroll runs ─────────────────────────────────────────────────────────

export function usePayrollRuns() {
  return useQuery({
    queryKey: PR_KEYS.runs,
    queryFn: () => api.get<ApiSuccess<PayrollRun[]>>(`/hr/payroll-runs`),
  });
}
export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: PR_KEYS.run(id!),
    queryFn: () => api.get<ApiSuccess<PayrollRun>>(`/hr/payroll-runs/${id}`),
    enabled: !!id,
  });
}
export function usePayslips(runId: string | null) {
  return useQuery({
    queryKey: PR_KEYS.payslips(runId!),
    queryFn: () => api.get<ApiSuccess<Payslip[]>>(`/hr/payroll-runs/${runId}/payslips`),
    enabled: !!runId,
  });
}
export function usePayslip(runId: string | null, payslipId: string | null) {
  return useQuery({
    queryKey: PR_KEYS.payslip(runId!, payslipId!),
    queryFn: () => api.get<ApiSuccess<Payslip>>(`/hr/payroll-runs/${runId}/payslips/${payslipId}`),
    enabled: !!runId && !!payslipId,
  });
}
export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { month: number; year: number; notes?: string }) =>
      api.post<ApiSuccess<PayrollRun>>(`/hr/payroll-runs`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: PR_KEYS.runs }),
  });
}
export function useProcessPayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<PayrollRun>>(`/hr/payroll-runs/${id}/process`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: PR_KEYS.run(id) });
      qc.invalidateQueries({ queryKey: PR_KEYS.payslips(id) });
      qc.invalidateQueries({ queryKey: PR_KEYS.runs });
    },
  });
}
export function useApprovePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<PayrollRun>>(`/hr/payroll-runs/${id}/approve`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: PR_KEYS.run(id) });
      qc.invalidateQueries({ queryKey: PR_KEYS.runs });
    },
  });
}
export interface Form24QRow {
  employeeCode: string; employeeName: string; pan: string | null;
  monthsPaid: number; totalGross: number; totalTds: number;
}
export function useForm24Q(year: number, quarter: number) {
  return useQuery({
    queryKey: ['hr', 'payroll', 'form24q', year, quarter],
    queryFn: () => api.get<{ data: { rows: Form24QRow[]; runs: number; year: number; quarter: number } }>(
      `/hr/payroll/form-24q?year=${year}&quarter=${quarter}`,
    ),
    enabled: !!year && !!quarter,
  });
}

export function useClosePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<PayrollRun>>(`/hr/payroll-runs/${id}/close`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: PR_KEYS.run(id) });
      qc.invalidateQueries({ queryKey: PR_KEYS.runs });
    },
  });
}
