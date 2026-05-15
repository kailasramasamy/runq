import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const EC_KEYS = {
  all: ['expense-claims'] as const,
  list: (filters?: Record<string, unknown>) => ['expense-claims', 'list', filters] as const,
  detail: (id: string) => ['expense-claims', 'detail', id] as const,
};

export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';
export type ExpenseCategory = 'Travel' | 'Meals' | 'Accommodation' | 'Supplies' | 'Communication' | 'Transport' | 'Other';

export interface ClaimLineItem {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
}

export interface ExpenseClaim {
  id: string;
  claimNumber: string;
  claimDate: string;
  description: string;
  status: ClaimStatus;
  lineItems?: ClaimLineItem[];
  items?: ClaimLineItem[];
  totalAmount: number;
  claimantName: string | null;
  employeeId: string | null;
  /** Settlement JE posted on /post — Dr expense / Cr 2111. Null until posted. */
  journalEntryId: string | null;
  /** Legacy: AP bill from the old employee-as-vendor flow. New claims don't set this. */
  billId: string | null;
  createdAt: string;
}

interface ClaimFilters {
  status?: ClaimStatus;
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useExpenseClaims(filters?: ClaimFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: EC_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<ExpenseClaim[]>>(`/hr/expense-claims${qs ? `?${qs}` : ''}`),
  });
}

export function useExpenseClaim(id: string | null) {
  return useQuery({
    queryKey: EC_KEYS.detail(id!),
    queryFn: () => api.get<{ data: ExpenseClaim }>(`/hr/expense-claims/${id}`),
    enabled: !!id,
  });
}

export interface CreateClaimInput {
  claimDate: string;
  description: string;
  items: { expenseDate: string; category: ExpenseCategory; description: string; amount: number }[];
}

export function useCreateExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClaimInput) =>
      api.post<ApiSuccess<ExpenseClaim>>('/hr/expense-claims', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

export function useSubmitClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<ExpenseClaim>>(`/hr/expense-claims/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

export function useApproveClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<ExpenseClaim>>(`/hr/expense-claims/${id}/approve`, { approved: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

/** Post the approved claim to GL: Dr <expense accounts> / Cr 2111
 *  Employee Reimbursements Payable. The link to the employee is required so
 *  the eventual reimbursement payment can attribute it correctly. */
export function usePostExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) =>
      api.post<ApiSuccess<ExpenseClaim>>(`/hr/expense-claims/${id}/post`, { employeeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

export interface RecordReimbursementPaymentInput {
  expenseClaimId: string;
  paymentDate: string;
  bankAccountId: string;
  paymentMethod?: 'bank_transfer' | 'cash' | 'cheque';
  reference?: string | null;
  notes?: string | null;
}

/** Pay the claimant: Dr 2111 / Cr bank, creates an employee_payments row,
 *  flips the claim to 'reimbursed'. */
export function useRecordReimbursementPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: RecordReimbursementPaymentInput) =>
      api.post<ApiSuccess<unknown>>(`/hr/employee-payments/reimburse`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

export function useUpdateExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateClaimInput }) =>
      api.put<ApiSuccess<ExpenseClaim>>(`/hr/expense-claims/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}

export function useDeleteExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<null>>(`/hr/expense-claims/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: EC_KEYS.all }),
  });
}
