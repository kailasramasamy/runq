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
export interface GeneratedStructure {
  name: string;
  description: string;
  components: Array<{ salaryComponentId: string; value: number; calcType: CalcType }>;
}
export function useGenerateSalaryStructure() {
  return useMutation({
    mutationFn: (d: { name?: string; roleHint: string; includeStatutory: boolean }) =>
      api.post<ApiSuccess<GeneratedStructure>>(`/hr/salary-structures/generate`, d),
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

// `/hr/me/payslips` — the logged-in user's own payslips, newest first. Each
// row carries its run's month/year/status so the UI needs no run id.
export interface MyPayslip extends Payslip {
  month: number;
  year: number;
  runStatus: PayrollRunStatus;
}
export function useMyPayslips() {
  return useQuery({
    queryKey: ['hr', 'me', 'payslips'],
    queryFn: () => api.get<ApiSuccess<MyPayslip[]>>('/hr/me/payslips'),
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
export interface PfChallan {
  run: { id: string; month: number; year: number; status: PayrollRunStatus };
  pfEstablishmentCode: string | null;
  totalEmployees: number;
  totalPfWages: number;
  account1Epf: number;
  account2Admin: number;
  account10Eps: number;
  account21Edli: number;
  account22EdliAdmin: number;
  employeeShare: number;
  employerShare: number;
  grandTotal: number;
}
export function usePfChallan(runId: string | null) {
  return useQuery({
    queryKey: ['hr', 'payroll', 'runs', runId, 'pf-challan'],
    queryFn: () => api.get<{ data: PfChallan }>(`/hr/payroll-runs/${runId}/pf-challan`),
    enabled: !!runId,
  });
}

export interface EsiChallan {
  run: { id: string; month: number; year: number; status: PayrollRunStatus };
  esiRegistrationNumber: string | null;
  totalIps: number;
  totalEsiWages: number;
  employeeShare: number;
  employerShare: number;
  grandTotal: number;
}
export function useEsiChallan(runId: string | null) {
  return useQuery({
    queryKey: ['hr', 'payroll', 'runs', runId, 'esi-challan'],
    queryFn: () => api.get<{ data: EsiChallan }>(`/hr/payroll-runs/${runId}/esi-challan`),
    enabled: !!runId,
  });
}

export interface PtChallan {
  run: { id: string; month: number; year: number; status: PayrollRunStatus };
  ptRegistrationNumber: string | null;
  challans: Array<{ stateCode: string; totalEmployees: number; totalPt: number }>;
}
export function usePtChallan(runId: string | null) {
  return useQuery({
    queryKey: ['hr', 'payroll', 'runs', runId, 'pt-challan'],
    queryFn: () => api.get<{ data: PtChallan }>(`/hr/payroll-runs/${runId}/pt-challan`),
    enabled: !!runId,
  });
}

// ─── TDS filing ───────────────────────────────────────────────────────────

export type TdsChallanStatus = 'pending' | 'deposited';

export interface TdsChallan {
  id: string;
  payrollRunId: string | null;
  periodMonth: number;
  periodYear: number;
  section: string;
  tdsAmount: string;
  interestAmount: string;
  lateFeeAmount: string;
  totalAmount: string;
  status: TdsChallanStatus;
  bsrCode: string | null;
  challanSerialNo: string | null;
  depositDate: string | null;
  paymentMode: string | null;
  bankRef: string | null;
  notes: string | null;
}

export function useTdsChallans() {
  return useQuery({
    queryKey: ['hr', 'tds', 'challans'],
    queryFn: () => api.get<ApiSuccess<TdsChallan[]>>(`/hr/tds-challans`),
  });
}

export interface RecordTdsDepositInput {
  bankAccountId: string;
  bsrCode: string;
  challanSerialNo: string;
  depositDate: string;
  paymentMode?: string | null;
  bankRef?: string | null;
  interestAmount?: number;
  lateFeeAmount?: number;
  notes?: string | null;
}
export function useRecordTdsDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: RecordTdsDepositInput & { id: string }) =>
      api.post<ApiSuccess<TdsChallan>>(`/hr/tds-challans/${id}/deposit`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'tds', 'challans'] }),
  });
}

// ─── Form 24Q quarterly returns ───────────────────────────────────────────

export type TdsReturnStatus = 'draft' | 'validated' | 'generated' | 'filed' | 'error';

export interface Form24QAnnexureIRow {
  employeeCode: string; employeeName: string; pan: string | null;
  challanBsrCode: string | null; challanSerialNo: string | null; challanDepositDate: string | null;
  paymentMonth: number; amountPaid: number; tdsDeducted: number;
}
export interface Form24QAnnexureIIRow {
  employeeCode: string; employeeName: string; pan: string | null;
  grossSalary: number; standardDeduction: number; taxableIncome: number;
  taxOnIncome: number; tdsDeducted: number; monthsPaid: number;
}
export interface TdsReturn {
  id: string; tan: string; returnType: string;
  financialYear: string; quarter: number;
  status: TdsReturnStatus;
  data: { annexureI: Form24QAnnexureIRow[]; annexureII?: Form24QAnnexureIIRow[] } | null;
  errorDetails: Array<{ code: string; message: string }> | null;
  token: string | null; filedAt: string | null; notes: string | null;
}

const TDS_RETURNS_KEY = ['hr', 'tds', 'returns'] as const;

export function useTdsReturns() {
  return useQuery({
    queryKey: TDS_RETURNS_KEY,
    queryFn: () => api.get<ApiSuccess<TdsReturn[]>>(`/hr/tds-returns`),
  });
}
export function useGenerateTdsReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { financialYear: string; quarter: number }) =>
      api.post<ApiSuccess<TdsReturn>>(`/hr/tds-returns/generate`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: TDS_RETURNS_KEY }),
  });
}
export function useValidateTdsReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<TdsReturn>>(`/hr/tds-returns/${id}/validate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: TDS_RETURNS_KEY }),
  });
}
export function useFileTdsReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; token: string; notes?: string | null }) =>
      api.post<ApiSuccess<TdsReturn>>(`/hr/tds-returns/${id}/file`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: TDS_RETURNS_KEY }),
  });
}
export function useDeleteTdsReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<{ ok: boolean }>>(`/hr/tds-returns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TDS_RETURNS_KEY }),
  });
}

// ─── Form 16 Part B ───────────────────────────────────────────────────────

export interface Form16QuarterRow {
  quarter: number; tds: number; receiptNumber: string | null;
}
export interface Form16PartB {
  employeeId: string; employeeCode: string; employeeName: string;
  employeePan: string | null; designation: string | null;
  grossSalary: number; standardDeduction: number; incomeChargeableSalaries: number;
  chapterVIADeductions: number; totalIncome: number;
  taxBeforeRebate: number; rebate87A: number; taxAfterRebate: number;
  cess: number; totalTaxLiability: number; tdsDeducted: number;
  balancePayable: number; monthsPaid: number;
  quarterly: Form16QuarterRow[];
}
export interface Form16Result {
  financialYear: string; assessmentYear: string;
  employer: { name: string; tan: string | null; pan: string | null };
  employees: Form16PartB[];
}
export function useForm16(financialYear: string) {
  return useQuery({
    queryKey: ['hr', 'tds', 'form16', financialYear],
    queryFn: () => api.get<ApiSuccess<Form16Result>>(`/hr/tds-form-16?financialYear=${financialYear}`),
    enabled: !!financialYear,
  });
}

// ─── Statutory calendar ───────────────────────────────────────────────────

export interface StatutoryDeadline {
  kind: 'tds_deposit' | 'tds_24q' | 'pt';
  label: string;
  sublabel: string;
  dueDate: string;
  status: 'pending' | 'done';
  amount?: number;
}
export function useStatutoryCalendar() {
  return useQuery({
    queryKey: ['hr', 'statutory-calendar'],
    queryFn: () => api.get<ApiSuccess<StatutoryDeadline[]>>(`/hr/statutory-calendar`),
  });
}

// ─── Statutory challans (PF / ESI / PT / TDS settlement) ────────────────

export type StatutoryChallanKind = 'pf' | 'esi' | 'pt' | 'tds';
export type StatutoryChallanStatus = 'pending' | 'deposited';

export interface StatutoryChallan {
  id: string;
  kind: StatutoryChallanKind;
  payrollRunId: string | null;
  periodMonth: number;
  periodYear: number;
  stateCode: string | null;
  section: string | null;
  liabilityAmount: string;
  interestAmount: string;
  lateFeeAmount: string;
  amount: string;
  status: StatutoryChallanStatus;
  bankBsrCode: string | null;
  referenceNumber: string | null;
  depositDate: string | null;
  paymentMode: string | null;
  bankRef: string | null;
  bankAccountId: string | null;
  journalEntryId: string | null;
  notes: string | null;
}

export function useStatutoryChallansForRun(
  runId: string | null,
  kind?: StatutoryChallanKind,
) {
  const q = new URLSearchParams();
  if (runId) q.set('payrollRunId', runId);
  if (kind) q.set('kind', kind);
  return useQuery({
    queryKey: ['hr', 'statutory-challans', runId, kind],
    queryFn: () => api.get<ApiSuccess<StatutoryChallan[]>>(`/hr/statutory-challans?${q.toString()}`),
    enabled: !!runId,
  });
}

export interface RecordStatutoryDepositInput {
  kind: 'pf' | 'esi' | 'pt';
  payrollRunId: string;
  stateCode?: string | null;
  bankAccountId: string;
  depositDate: string;
  paymentMode?: string | null;
  bankRef?: string | null;
  referenceNumber?: string | null;
  interestAmount?: number;
  lateFeeAmount?: number;
  notes?: string | null;
}

export function useRecordStatutoryDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: RecordStatutoryDepositInput) =>
      api.post<ApiSuccess<StatutoryChallan>>(`/hr/statutory-challans/deposit`, d),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'statutory-challans', vars.payrollRunId] });
      qc.invalidateQueries({ queryKey: ['hr', 'statutory-challans', vars.payrollRunId, vars.kind] });
    },
  });
}

// ─── Employee payments (payroll subledger settlement) ────────────────────

export type EmployeePaymentStatus = 'pending' | 'paid';
export type EmployeePaymentMethod = 'bank_transfer' | 'cash' | 'cheque';

export interface EmployeePayment {
  id: string;
  sourceType: 'payroll_run' | 'expense_claim';
  payrollRunId: string | null;
  expenseClaimId: string | null;
  employeeId: string | null;
  paymentDate: string;
  amount: string;
  bankAccountId: string | null;
  paymentMethod: EmployeePaymentMethod;
  reference: string | null;
  status: EmployeePaymentStatus;
  journalEntryId: string | null;
  notes: string | null;
}

export function useEmployeePaymentsForRun(runId: string | null) {
  return useQuery({
    queryKey: ['hr', 'employee-payments', 'run', runId],
    queryFn: () => api.get<ApiSuccess<EmployeePayment[]>>(`/hr/employee-payments?payrollRunId=${runId}`),
    enabled: !!runId,
  });
}

export interface RecordSalaryPaymentInput {
  payrollRunId: string;
  paymentDate: string;
  bankAccountId: string;
  paymentMethod?: EmployeePaymentMethod;
  reference?: string | null;
  notes?: string | null;
}
export function useRecordSalaryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: RecordSalaryPaymentInput) =>
      api.post<ApiSuccess<EmployeePayment>>(`/hr/employee-payments`, d),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'employee-payments', 'run', vars.payrollRunId] });
      qc.invalidateQueries({ queryKey: PR_KEYS.run(vars.payrollRunId) });
    },
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
