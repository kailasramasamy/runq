import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PurchaseInvoice, PurchaseInvoiceWithDetails, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { ThreeWayMatchResult } from '@runq/types';
import type { CreatePurchaseInvoiceInput, UpdatePurchaseInvoiceInput, PurchaseInvoiceFilter } from '@runq/validators';

const INVOICE_KEYS = {
  all: ['purchase-invoices'] as const,
  list: (filters?: Record<string, unknown>) => ['purchase-invoices', 'list', filters] as const,
  detail: (id: string) => ['purchase-invoices', 'detail', id] as const,
};

function buildFilterQs(filters?: PurchaseInvoiceFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.vendorId) params.set('vendorId', filters.vendorId);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function usePurchaseInvoices(filters?: PurchaseInvoiceFilter) {
  return useQuery({
    queryKey: INVOICE_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<PurchaseInvoice>>(`/ap/purchase-invoices${buildFilterQs(filters)}`),
  });
}

export function usePurchaseInvoice(id: string) {
  return useQuery({
    queryKey: INVOICE_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<PurchaseInvoiceWithDetails>>(`/ap/purchase-invoices/${id}`),
    enabled: !!id,
  });
}

export function useCreatePurchaseInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseInvoiceInput) =>
      api.post<ApiSuccess<PurchaseInvoice>>('/ap/purchase-invoices', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }),
  });
}

export function useUpdatePurchaseInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePurchaseInvoiceInput }) =>
      api.put<ApiSuccess<PurchaseInvoice>>(`/ap/purchase-invoices/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
    },
  });
}

export function useThreeWayMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, poId, grnId }: { id: string; poId: string; grnId: string }) =>
      api.post<ApiSuccess<ThreeWayMatchResult>>(`/ap/purchase-invoices/${id}/match`, { poId, grnId }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
    },
  });
}

export function useApproveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.post<ApiSuccess<PurchaseInvoice>>(`/ap/purchase-invoices/${id}/approve`, { notes }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
    },
  });
}

export function useDeletePurchaseInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ap/purchase-invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }),
  });
}
