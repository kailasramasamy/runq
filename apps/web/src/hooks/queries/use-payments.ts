import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { VendorPayment, VendorPaymentWithAllocations, PaginatedResponse, ApiSuccess, BatchPaymentResult, BatchImportResult } from '@runq/types';
import type {
  CreateVendorPaymentInput,
  CreateAdvancePaymentInput,
  CreateDirectPaymentInput,
  AdjustAdvanceInput,
  VendorPaymentFilter,
  CreateBatchPaymentInput,
  ImportBatchPaymentInput,
} from '@runq/validators';

const PAYMENT_KEYS = {
  all: ['payments'] as const,
  list: (filters?: Record<string, unknown>) => ['payments', 'list', filters] as const,
  detail: (id: string) => ['payments', 'detail', id] as const,
};

// A payment moves bill balance/status, vendor advance balance and the audit trail,
// so every payment mutation must refresh those alongside the payment list.
function invalidatePaymentEffects(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all });
  qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
  qc.invalidateQueries({ queryKey: ['vendor-advance-balance'] });
  qc.invalidateQueries({ queryKey: ['document-trail'] });
}

function buildFilterQs(filters?: VendorPaymentFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.vendorId) params.set('vendorId', filters.vendorId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useVendorPayments(filters?: VendorPaymentFilter, page = 1, limit = 20) {
  const key = { ...filters, page, limit };
  return useQuery({
    queryKey: PAYMENT_KEYS.list(key as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.vendorId) params.set('vendorId', filters.vendorId);
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.set('dateTo', filters.dateTo);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api.get<PaginatedResponse<VendorPayment>>(`/ap/payments?${params.toString()}`);
    },
  });
}

export function useVendorPayment(id: string) {
  return useQuery({
    queryKey: PAYMENT_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<VendorPaymentWithAllocations>>(`/ap/payments/${id}`),
    enabled: !!id,
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVendorPaymentInput) =>
      api.post<ApiSuccess<VendorPayment>>('/ap/payments', data),
    onSuccess: () => invalidatePaymentEffects(qc),
  });
}

export function useCreateAdvancePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdvancePaymentInput) =>
      api.post<ApiSuccess<VendorPayment>>('/ap/payments/advance', data),
    onSuccess: () => invalidatePaymentEffects(qc),
  });
}

export function useCreateDirectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDirectPaymentInput) =>
      api.post<ApiSuccess<VendorPayment>>('/ap/payments/direct', data),
    onSuccess: () => invalidatePaymentEffects(qc),
  });
}

export function useAdjustAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdjustAdvanceInput }) =>
      api.post<ApiSuccess<VendorPayment>>(`/ap/payments/${id}/adjust`, data),
    onSuccess: (_res, { id }) => {
      invalidatePaymentEffects(qc);
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.detail(id) });
    },
  });
}

export function useCreateBatchPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchPaymentInput) =>
      api.post<ApiSuccess<BatchPaymentResult>>('/ap/payments/batch', data),
    onSuccess: () => invalidatePaymentEffects(qc),
  });
}

export function useImportBatchPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBatchPaymentInput) =>
      api.post<ApiSuccess<BatchImportResult>>('/ap/payments/import', data),
    onSuccess: () => invalidatePaymentEffects(qc),
  });
}

export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<VendorPayment>>(`/ap/payments/${id}/approve`, {}),
    onSuccess: (_res, id) => {
      invalidatePaymentEffects(qc);
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.detail(id) });
    },
  });
}

export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<ApiSuccess<{ success: boolean }>>(`/ap/payments/${id}/reject`, { reason }),
    onSuccess: (_res, { id }) => {
      invalidatePaymentEffects(qc);
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.detail(id) });
    },
  });
}

export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<ApiSuccess<{ success: boolean }>>(`/ap/payments/${id}/reverse`, { reason }),
    onSuccess: (_res, { id }) => {
      invalidatePaymentEffects(qc);
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.detail(id) });
    },
  });
}
