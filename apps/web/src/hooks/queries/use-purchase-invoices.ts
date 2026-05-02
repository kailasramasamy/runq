import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PurchaseInvoice, PurchaseInvoiceWithDetails, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { ThreeWayMatchResult } from '@runq/types';
import type { CreatePurchaseInvoiceInput, UpdatePurchaseInvoiceInput, PurchaseInvoiceFilter } from '@runq/validators';

interface BillsSummary {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  pendingApprovalCount: number;
  paidThisMonth: number;
}

const INVOICE_KEYS = {
  all: ['purchase-invoices'] as const,
  list: (filters?: Record<string, unknown>) => ['purchase-invoices', 'list', filters] as const,
  detail: (id: string) => ['purchase-invoices', 'detail', id] as const,
  summary: ['purchase-invoices', 'summary'] as const,
};

function buildFilterQs(filters?: PurchaseInvoiceFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.vendorId) params.set('vendorId', filters.vendorId);
  if (filters.status) params.set('status', filters.status);
  if (filters.vendorCategory) params.set('vendorCategory', filters.vendorCategory);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useBillsSummary() {
  return useQuery({
    queryKey: INVOICE_KEYS.summary,
    queryFn: () => api.get<{ data: BillsSummary }>('/ap/purchase-invoices/summary'),
  });
}

export function usePurchaseInvoices(filters?: PurchaseInvoiceFilter, page = 1, limit = 20) {
  const paginationKey = { ...filters, page, limit };
  return useQuery({
    queryKey: INVOICE_KEYS.list(paginationKey as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.vendorId) params.set('vendorId', filters.vendorId);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.vendorCategory) params.set('vendorCategory', filters.vendorCategory);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.set('dateTo', filters.dateTo);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api.get<PaginatedResponse<PurchaseInvoice>>(`/ap/purchase-invoices?${params.toString()}`);
    },
  });
}

export function usePurchaseInvoice(id: string) {
  return useQuery({
    queryKey: INVOICE_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<PurchaseInvoiceWithDetails>>(`/ap/purchase-invoices/${id}`),
    enabled: !!id,
  });
}

export function useVendorAdvanceBalance(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-advance-balance', vendorId],
    queryFn: () => api.get<ApiSuccess<{ vendorId: string; balance: number }>>(
      `/ap/purchase-invoices/vendor-advance-balance/${vendorId}`,
    ),
    enabled: !!vendorId,
  });
}

export function useApplyAdvanceToBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) =>
      api.post<ApiSuccess<PurchaseInvoiceWithDetails> & { meta?: { advanceApplied: number } }>(
        `/ap/purchase-invoices/${billId}/apply-advance`,
      ),
    onSuccess: (_res, billId) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(billId) });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: ['vendor-advance-balance'] });
    },
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
