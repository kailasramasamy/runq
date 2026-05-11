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

export function useReimburseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<ExpenseClaim>>(`/hr/expense-claims/${id}/reimburse`, {}),
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
