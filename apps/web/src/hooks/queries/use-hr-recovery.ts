import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';
import type { EmployeeLoan } from './use-hr-phase-next';

// ===== TYPES =====

export type DeductionCategory = 'goods_purchase' | 'canteen' | 'damage' | 'uniform' | 'fine' | 'other';
export type DeductionStatus = 'active' | 'recovered' | 'cancelled';

export interface EmployeeDeduction {
  id: string;
  employeeId: string;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
  category: DeductionCategory;
  description: string | null;
  amount: string;
  instalment: string;
  outstanding: string;
  startMonth: number;
  startYear: number;
  status: DeductionStatus;
  createdAt: string;
}

export interface DeductionRecovery {
  id: string;
  amount: string;
  payrollRunId: string;
  month: number;
  year: number;
}

export interface RecoverySummary {
  /** Active advances/loans and deductions, not counts — the API returns rows. */
  loans: EmployeeLoan[];
  deductions: EmployeeDeduction[];
  loanOutstanding: number;
  deductionOutstanding: number;
  totalOutstanding: number;
  nextRunEstimate: number;
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'cheque';

// ===== HOOKS =====
function invalidate(qc: ReturnType<typeof useQueryClient>, key: string) {
  qc.invalidateQueries({ queryKey: [key] });
}

// -- Deductions --
export const useDeductions = (q: { employeeId?: string; status?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const qs = params.toString();
  return useQuery({
    queryKey: ['deductions', q],
    queryFn: () => api.get<ApiSuccess<EmployeeDeduction[]>>(`/hr/deductions${qs ? `?${qs}` : ''}`),
  });
};

export const useDeduction = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['deduction', id],
  queryFn: () => api.get<ApiSuccess<EmployeeDeduction & { recoveries: DeductionRecovery[] }>>(`/hr/deductions/${id}`),
});

export const useCreateDeduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: {
      employeeId: string;
      category: DeductionCategory;
      description?: string;
      amount: number;
      instalment?: number;
      startMonth: number;
      startYear: number;
    }) => api.post<ApiSuccess<EmployeeDeduction>>('/hr/deductions', d),
    onSuccess: () => invalidate(qc, 'deductions'),
  });
};

export const useUpdateDeduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: {
      id: string;
      category?: DeductionCategory;
      description?: string;
      instalment?: number;
      startMonth?: number;
      startYear?: number;
    }) => api.put<ApiSuccess<EmployeeDeduction>>(`/hr/deductions/${id}`, d),
    onSuccess: () => { invalidate(qc, 'deductions'); invalidate(qc, 'deduction'); },
  });
};

export const useCancelDeduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<EmployeeDeduction>>(`/hr/deductions/${id}/cancel`, {}),
    onSuccess: () => { invalidate(qc, 'deductions'); invalidate(qc, 'deduction'); },
  });
};

export const useDeleteDeduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<EmployeeDeduction>>(`/hr/deductions/${id}`),
    onSuccess: () => invalidate(qc, 'deductions'),
  });
};

// -- Recovery summary --
export const useRecoverySummary = (employeeId: string | null) => useQuery({
  enabled: !!employeeId,
  queryKey: ['recovery-summary', employeeId],
  queryFn: () => api.get<ApiSuccess<RecoverySummary>>(`/hr/employees/${employeeId}/recovery-summary`),
});

// -- Advances --
export const useCreateAdvance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: {
      employeeId: string;
      /** Labels the payslip line; recovery is identical across kinds. */
      kind?: 'advance' | 'personal' | 'festival' | 'education' | 'other';
      amount: number;
      totalInstalments?: number;
      disbursedOn: string;
      firstEmiMonth: number;
      firstEmiYear: number;
      reason?: string;
      paymentMethod?: PaymentMethod;
      bankAccountId?: string;
      reference?: string;
    }) => api.post<ApiSuccess<{ loan: EmployeeLoan; payment: unknown }>>('/hr/advances', d),
    onSuccess: () => invalidate(qc, 'loans'),
  });
};

// -- Loan disbursement --
export const useDisburseLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: {
      id: string;
      paymentDate: string;
      bankAccountId?: string;
      paymentMethod: PaymentMethod;
      reference?: string;
      notes?: string;
    }) => api.post<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}/disburse`, d),
    onSuccess: () => { invalidate(qc, 'loans'); invalidate(qc, 'loan'); },
  });
};

// -- Loan edit / write-off --
export const useUpdateLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: {
      id: string;
      principal?: number;
      remainingInstalments?: number;
      firstEmiMonth?: number;
      firstEmiYear?: number;
      reason?: string;
    }) => api.put<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}`, d),
    onSuccess: () => { invalidate(qc, 'loans'); invalidate(qc, 'loan'); },
  });
};

export const useWriteOffLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.put<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}/write-off`, { reason }),
    onSuccess: () => { invalidate(qc, 'loans'); invalidate(qc, 'loan'); },
  });
};
