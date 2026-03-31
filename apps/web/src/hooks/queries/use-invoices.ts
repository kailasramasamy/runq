import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { SalesInvoice, SalesInvoiceWithDetails, PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreateSalesInvoiceInput,
  UpdateSalesInvoiceInput,
  SendInvoiceInput,
  MarkPaidInput,
} from '@runq/validators';

const INVOICE_KEYS = {
  all: ['invoices'] as const,
  list: (filters?: Record<string, unknown>) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
};

interface InvoiceFilters {
  customerId?: string;
  status?: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useInvoices(filters?: InvoiceFilters) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: INVOICE_KEYS.list(filters),
    queryFn: () =>
      api.get<PaginatedResponse<SalesInvoiceWithDetails>>(`/ar/invoices${qs ? `?${qs}` : ''}`),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: INVOICE_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<SalesInvoiceWithDetails>>(`/ar/invoices/${id}`),
    enabled: !!id,
  });
}

export interface InvoiceReceipt {
  id: string;
  receiptDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
}

export function useInvoiceReceipts(invoiceId: string) {
  return useQuery({
    queryKey: [...INVOICE_KEYS.detail(invoiceId), 'receipts'] as const,
    queryFn: () => api.get<{ data: InvoiceReceipt[] }>(`/ar/invoices/${invoiceId}/receipts`),
    enabled: !!invoiceId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSalesInvoiceInput) =>
      api.post<ApiSuccess<SalesInvoice>>('/ar/invoices', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSalesInvoiceInput }) =>
      api.put<ApiSuccess<SalesInvoice>>(`/ar/invoices/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
    },
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SendInvoiceInput }) =>
      api.post<ApiSuccess<SalesInvoice>>(`/ar/invoices/${id}/send`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
    },
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MarkPaidInput }) =>
      api.post<ApiSuccess<SalesInvoice>>(`/ar/invoices/${id}/mark-paid`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }),
  });
}
