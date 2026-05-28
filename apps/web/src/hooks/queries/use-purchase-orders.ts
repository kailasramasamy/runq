import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PurchaseOrder, PurchaseOrderWithLines } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ClosePurchaseOrderInput,
  CancelPurchaseOrderInput,
} from '@runq/validators';

interface POListFilters {
  vendorId?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

type POListRow = PurchaseOrder & { vendorName: string; lineCount: number };

const PO_KEYS = {
  all: ['purchase-orders'] as const,
  list: (filters?: POListFilters) => ['purchase-orders', 'list', filters] as const,
  detail: (id: string) => ['purchase-orders', 'detail', id] as const,
};

export function usePurchaseOrders(filters?: POListFilters) {
  const params = new URLSearchParams();
  if (filters?.vendorId) params.set('vendorId', filters.vendorId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: PO_KEYS.list(filters),
    queryFn: () => api.get<PaginatedResponse<POListRow>>(`/purchase/pos${qs ? `?${qs}` : ''}`),
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: PO_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<PurchaseOrderWithLines>>(`/purchase/pos/${id}`),
    enabled: !!id,
  });
}

export interface PoLinkedGrn {
  id: string; grnNo: string; receivedDate: string;
  source: 'po' | 'bill' | 'direct' | 'po_with_bill';
  totalValue: number; status: string; billId: string | null;
}
export interface PoLinkedBill {
  id: string; invoiceNumber: string; invoiceDate: string;
  totalAmount: number; status: string;
}
export interface PoLinkedDocuments {
  grns: PoLinkedGrn[]; bills: PoLinkedBill[];
}

export function usePoLinkedDocuments(id: string) {
  return useQuery({
    queryKey: [...PO_KEYS.detail(id), 'linked-documents'] as const,
    queryFn: () => api.get<ApiSuccess<PoLinkedDocuments>>(`/purchase/pos/${id}/linked-documents`),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseOrderInput) =>
      api.post<ApiSuccess<PurchaseOrderWithLines>>('/purchase/pos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_KEYS.all }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePurchaseOrderInput }) =>
      api.put<ApiSuccess<PurchaseOrderWithLines>>(`/purchase/pos/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: PO_KEYS.all });
    },
  });
}

export function useSendPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<PurchaseOrderWithLines>>(`/purchase/pos/${id}/send`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: PO_KEYS.all });
    },
  });
}

export function useClosePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClosePurchaseOrderInput }) =>
      api.post<ApiSuccess<PurchaseOrderWithLines>>(`/purchase/pos/${id}/close`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: PO_KEYS.all });
    },
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CancelPurchaseOrderInput }) =>
      api.post<ApiSuccess<PurchaseOrderWithLines>>(`/purchase/pos/${id}/cancel`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PO_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: PO_KEYS.all });
    },
  });
}
