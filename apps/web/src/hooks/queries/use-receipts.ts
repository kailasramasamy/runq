import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PaymentReceipt, ReceiptAllocation, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateReceiptInput, ReceiptFilter } from '@runq/validators';

export interface ReceiptAllocationDetail extends ReceiptAllocation {
  invoiceNumber: string;
  invoiceTotal: number;
  invoiceBalanceDue: number;
  invoiceStatus: string;
}

export interface ReceiptWithAllocations extends PaymentReceipt {
  allocations: ReceiptAllocationDetail[];
  customerName: string;
}

const RECEIPT_KEYS = {
  all: ['receipts'] as const,
  list: (filters?: Record<string, unknown>) => ['receipts', 'list', filters] as const,
  detail: (id: string) => ['receipts', 'detail', id] as const,
};

function buildFilterQs(filters?: ReceiptFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.customerId) params.set('customerId', filters.customerId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useReceipts(filters?: ReceiptFilter) {
  return useQuery({
    queryKey: RECEIPT_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<PaymentReceipt>>(`/ar/receipts${buildFilterQs(filters)}`),
  });
}

export function useReceipt(id: string) {
  return useQuery({
    queryKey: RECEIPT_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<ReceiptWithAllocations>>(`/ar/receipts/${id}`),
    enabled: !!id,
  });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReceiptInput) =>
      api.post<ApiSuccess<PaymentReceipt>>('/ar/receipts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECEIPT_KEYS.all }),
  });
}
