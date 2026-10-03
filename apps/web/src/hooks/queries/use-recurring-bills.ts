import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

export type RecurringCategory = 'rent' | 'transport' | 'other';
/** `semi_monthly` bills half the monthly amount on the 1st and on the 16th. */
export type RecurringFrequency = 'monthly' | 'semi_monthly';

export interface RecurringAgreement {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  category: RecurringCategory;
  expenseAccountCode: string | null;
  amount: string;
  frequency: RecurringFrequency;
  billDay: number;
  startMonth: string;
  endMonth: string | null;
  isActive: boolean;
  billed: number;
  paid: number;
  outstanding: number;
  advanceHeld: number;
  lastPayment: { date: string; amount: number } | null;
}

export interface RecurringMonth {
  id: string;
  period: string;
  /** 'Sep 2026', or 'Sep 2026 — 1st half' on a twice-monthly agreement. */
  label: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  paid: string;
  balance: string;
  status: 'approved' | 'partially_paid' | 'paid';
}

export interface RecurringPayment {
  id: string;
  date: string;
  amount: number;
  reference: string | null;
  /** 'pending' = recorded on the AP payments page, awaiting approval. */
  status: 'completed' | 'pending';
  unapplied: number;
  /** The agreement periods this payment settled, oldest first. */
  paidFor: Array<{ label: string; amount: number }>;
}

export interface RecurringAgreementDetail extends RecurringAgreement {
  months: RecurringMonth[];
  payments: RecurringPayment[];
}

export interface CreateRecurringInput {
  vendorId: string;
  title: string;
  category: RecurringCategory;
  expenseAccountCode?: string | null;
  amount: number;
  frequency: RecurringFrequency;
  billDay: number;
  startMonth: string;
  endMonth?: string | null;
}

export interface UpdateRecurringInput {
  title?: string;
  expenseAccountCode?: string | null;
  amount?: number;
  billDay?: number;
  endMonth?: string | null;
  isActive?: boolean;
}

export interface RecordRecurringPaymentInput {
  amount: number;
  paymentDate: string;
  bankAccountId: string;
  referenceNumber?: string;
  notes?: string;
  asAdvance: boolean;
  /** Periods (bill ids) to settle, in order; omitted = oldest due first. */
  billIds?: string[];
}

const KEYS = {
  all: ['recurring-bills'] as const,
  list: () => ['recurring-bills', 'list'] as const,
  detail: (id: string) => ['recurring-bills', 'detail', id] as const,
};

export function useRecurringBills() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => api.get<{ data: RecurringAgreement[] }>('/ap/recurring-bills'),
  });
}

export function useRecurringBill(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<RecurringAgreementDetail>>(`/ap/recurring-bills/${id}`),
    enabled: !!id,
  });
}

export function useCreateRecurringBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecurringInput) =>
      api.post<ApiSuccess<RecurringAgreement>>('/ap/recurring-bills', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}

export function useUpdateRecurringBill(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateRecurringInput) =>
      api.put<ApiSuccess<RecurringAgreement>>(`/ap/recurring-bills/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useRecordRecurringPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordRecurringPaymentInput) =>
      api.post<ApiSuccess<{ paidToBills: number; heldAsAdvance: number }>>(`/ap/recurring-bills/${id}/payments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      qc.invalidateQueries({ queryKey: ['vendor-advance-balance'] });
    },
  });
}

export function useDeleteRecurringBill(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<ApiSuccess<{ id: string; billsRemoved: number }>>(`/ap/recurring-bills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}

/** Cancel a recorded payment: its periods go back to due, its GL entry is reversed. */
export function useCancelRecurringPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.post<ApiSuccess<{ id: string }>>(`/ap/recurring-bills/${id}/payments/${paymentId}/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}
