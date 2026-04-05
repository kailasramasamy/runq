import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const SO_KEYS = {
  all: ['sales-orders'] as const,
  list: (filters?: Record<string, unknown>) => ['sales-orders', 'list', filters] as const,
  detail: (id: string) => ['sales-orders', 'detail', id] as const,
};

export type SalesOrderStatus = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled' | 'converted';

export interface SOLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: SalesOrderStatus;
  lineItems: SOLineItem[];
  totalAmount: number;
  notes: string | null;
  createdAt: string;
}

interface SOFilters {
  customerId?: string;
  status?: SalesOrderStatus;
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useSalesOrders(filters?: SOFilters) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: SO_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<SalesOrder[]>>(`/ar/sales-orders${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateSalesOrderInput {
  customerId: string;
  orderDate: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  notes?: string;
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSalesOrderInput) =>
      api.post<ApiSuccess<SalesOrder>>('/ar/sales-orders', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SO_KEYS.all }),
  });
}

export function useConvertSOToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ invoiceId: string }>>(`/ar/sales-orders/${id}/convert-to-invoice`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: SO_KEYS.all }),
  });
}
