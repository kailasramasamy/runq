import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { SalesInvoice, SalesInvoiceWithDetails, PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreateSalesInvoiceInput,
  UpdateSalesInvoiceInput,
  SendInvoiceInput,
  MarkPaidInput,
} from '@runq/validators';

interface InvoiceSummary {
  totalSales: number;
  totalReceived: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  draftCount: number;
  pendingCount: number;
}

interface InvoiceSummaryFilters {
  customerId?: string;
  status?: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}

const INVOICE_KEYS = {
  all: ['invoices'] as const,
  list: (filters?: Record<string, unknown>) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
  summary: (filters?: Record<string, unknown>) => ['invoices', 'summary', filters] as const,
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

export function useInvoiceSummary(filters?: InvoiceSummaryFilters) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return useQuery({
    queryKey: INVOICE_KEYS.summary(filters),
    queryFn: () => api.get<{ data: InvoiceSummary }>(`/ar/invoices/summary${qs ? `?${qs}` : ''}`),
  });
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

export function useUpdateInvoiceHsn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: Array<{ id: string; hsnSacCode: string }> }) =>
      api.patch<ApiSuccess<SalesInvoice>>(`/ar/invoices/${id}/hsn`, { items }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
    },
  });
}

/**
 * Present only when the tenant dispatches stock on issue — the invoice went
 * out either way, so this reports what happened to the goods behind it.
 */
export type AutoDispatchOutcome =
  | { status: 'skipped'; reason: string }
  | {
    status: 'dispatched';
    dnId: string;
    dnNo: string;
    lineCount: number;
    /** Lines the warehouse couldn't cover, left as a draft DN in the queue. */
    shortfall?: { dnId: string; dnNo: string; lineCount: number; reason: string };
  }
  | { status: 'failed'; reason: string; dnId?: string; dnNo?: string };

/** What became of the customer email, mirrored from InvoiceEmailResult on the API. */
export interface InvoiceEmailResult {
  sent: boolean;
  to: string[];
  attached: boolean;
  reason?: string;
}

type SentInvoice = SalesInvoice & { autoDispatch?: AutoDispatchOutcome; email?: InvoiceEmailResult };

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SendInvoiceInput }) =>
      api.post<ApiSuccess<SentInvoice>>(`/ar/invoices/${id}/send`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
      // Auto-dispatch moves stock and raises a DN, so those views are stale too.
      qc.invalidateQueries({ queryKey: ['inventory'] });
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

export function useMarkPaidFromWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MarkPaidInput }) =>
      api.post<ApiSuccess<SalesInvoice>>(`/ar/invoices/${id}/mark-paid-from-wallet`, data),
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
    onSuccess: (_data, id) => {
      // Drop the deleted invoice's cached queries so an in-flight detail page
      // doesn't refetch a 404. Then invalidate list/summary for refresh.
      qc.removeQueries({ queryKey: ['invoices', 'detail', id] });
      qc.removeQueries({ queryKey: ['invoices', 'upi-link', id] });
      qc.removeQueries({ queryKey: ['invoices', 'interest', id] });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
    },
  });
}

/**
 * Void a sent/paid/overdue invoice — issues an auto-CN mirroring the
 * invoice's items + tax, then marks the invoice cancelled. Used when an
 * already-filed invoice must be reversed (CN flows through the next
 * GSTR-1 as a CDN entry). The customer's receipt allocations are
 * untouched — the over-collection becomes a customer credit balance.
 */
export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, issueDate }: { id: string; reason: string; issueDate?: string }) =>
      api.post<ApiSuccess<{ invoice: SalesInvoice; creditNoteId: string }>>(
        `/ar/invoices/${id}/void`,
        { reason, ...(issueDate && { issueDate }) },
      ),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: ['invoices', 'detail', id] });
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
    },
  });
}

/**
 * Hard delete — physically removes the invoice row from the DB.
 * Distinct from useDeleteInvoice (which is the soft-cancel "Discard").
 * Backend restricts this to draft + cancelled statuses and refuses if
 * any payments / credit notes / GL entries reference the invoice.
 */
export function useHardDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/invoices/${id}/hard`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ['invoices', 'detail', id] });
      qc.removeQueries({ queryKey: ['invoices', 'upi-link', id] });
      qc.removeQueries({ queryKey: ['invoices', 'interest', id] });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
    },
  });
}

export function useBatchUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { invoiceIds: string[]; status: 'sent' | 'cancelled' }) =>
      api.post<ApiSuccess<{ updated: number; skipped: { id: string; reason: string }[] }>>(
        '/ar/invoices/batch-status',
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }),
  });
}
