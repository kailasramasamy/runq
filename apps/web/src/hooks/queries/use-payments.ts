import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

function buildFilterQs(filters?: VendorPaymentFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.vendorId) params.set('vendorId', filters.vendorId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useVendorPayments(filters?: VendorPaymentFilter) {
  return useQuery({
    queryKey: PAYMENT_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<VendorPayment>>(`/ap/payments${buildFilterQs(filters)}`),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  });
}

export function useCreateAdvancePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdvancePaymentInput) =>
      api.post<ApiSuccess<VendorPayment>>('/ap/payments/advance', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  });
}

export function useCreateDirectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDirectPaymentInput) =>
      api.post<ApiSuccess<VendorPayment>>('/ap/payments/direct', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  });
}

export function useAdjustAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdjustAdvanceInput }) =>
      api.post<ApiSuccess<VendorPayment>>(`/ap/payments/${id}/adjust`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: PAYMENT_KEYS.detail(id) });
    },
  });
}

export function useCreateBatchPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchPaymentInput) =>
      api.post<ApiSuccess<BatchPaymentResult>>('/ap/payments/batch', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  });
}

export function useImportBatchPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBatchPaymentInput) =>
      api.post<ApiSuccess<BatchImportResult>>('/ap/payments/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENT_KEYS.all }),
  });
}
