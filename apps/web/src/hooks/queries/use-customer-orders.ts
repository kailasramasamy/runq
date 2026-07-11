import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const CUSTOMER_ORDER_KEYS = {
  all: ['customer-orders'] as const,
  list: (filters?: Record<string, unknown>) => ['customer-orders', 'list', filters] as const,
  detail: (id: string) => ['customer-orders', 'detail', id] as const,
};

export type CustomerOrderSourceChannel =
  | 'share_sheet'
  | 'web_drop'
  | 'web_upload'
  | 'paste_image'
  | 'paste_text'
  | 'email_forward';

export type CustomerOrderUploadStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'parse_error'
  | 'discarded';

export type CustomerOrderReviewStatus =
  | 'parsing'
  | 'ready'
  | 'needs_review'
  | 'error'
  | 'approved'
  | 'rejected';

export type CustomerOrderFilterStatus =
  | 'all'
  | 'pending'
  | 'ready'
  | 'needs_review'
  | 'error'
  | 'approved'
  | 'rejected';

export interface CustomerOrderRow {
  id: string;
  draftId: string | null;
  source: CustomerOrderSourceChannel;
  uploadStatus: CustomerOrderUploadStatus;
  reviewStatus: CustomerOrderReviewStatus | null;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  hasRawText: boolean;
  errorMessage: string | null;
  customerId: string | null;
  customerName: string | null;
  buyerNameRaw: string | null;
  poNumberExtracted: string | null;
  poDate: string | null;
  grandTotal: string | null;
  uploadedAt: string;
  updatedAt: string;
}

export interface CustomerOrderListResponse {
  data: CustomerOrderRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface CustomerOrderFilters {
  status?: CustomerOrderFilterStatus;
  customerId?: string;
  source?: CustomerOrderSourceChannel;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useCustomerOrders(filters?: CustomerOrderFilters) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.source) params.set('source', filters.source);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: CUSTOMER_ORDER_KEYS.list(filters),
    queryFn: () => api.get<CustomerOrderListResponse>(`/ar/po-drafts${qs ? `?${qs}` : ''}`),
    // Auto-refresh every 5s while parsing rows are present (Phase 2 will use this).
    refetchInterval: 5000,
  });
}

export interface CustomerOrderLineRaw {
  id: string;
  lineIndex: number;
  rawDescription: string;
  rawQty: string | null;
  rawUom: string | null;
  rawRate: string | null;
  matchedItemId: string | null;
  matchSource: string | null;
  matchConfidence: string | null;
  resolvedRate: string | null;
  resolvedUom: string | null;
  taxCategory: string | null;
  amount: string | null;
  reviewFlag: string | null;
  matchedItemName: string | null;
  matchedItemUnit: string | null;
  matchedItemGstRate: string | null;
}

export interface CustomerOrderDetail extends CustomerOrderRow {
  sourceMetadata: unknown;
  customerMatchSource: string | null;
  customerMatchConfidence: string | null;
  buyerGstinRaw: string | null;
  deliveryDate: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  reviewFlags: unknown;
  approvedInvoiceId: string | null;
  approvedInvoiceNumber: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  llmModel: string | null;
  rawText: string | null;
  lines: CustomerOrderLineRaw[];
}

export function useCustomerOrder(id: string | null) {
  return useQuery({
    queryKey: CUSTOMER_ORDER_KEYS.detail(id ?? ''),
    queryFn: () => api.get<ApiSuccess<CustomerOrderDetail>>(`/ar/po-drafts/${id}`),
    enabled: !!id,
  });
}

interface UploadFileVars {
  file: File;
  source: CustomerOrderSourceChannel;
  sourceMetadata?: Record<string, unknown>;
}

interface UploadResultRow {
  id: string;
  status: CustomerOrderUploadStatus;
}

/**
 * Typed error thrown by the PO upload mutation. Preserves the API's
 * structured `details` payload — notably the existing upload id when the
 * server rejects a duplicate (409) — so the caller can render an actionable
 * dialog instead of a bare toast.
 */
export class CustomerOrderUploadError extends Error {
  status: number;
  errorCode?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, errorCode?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CustomerOrderUploadError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export function isCustomerOrderDuplicateError(err: unknown): err is CustomerOrderUploadError & {
  details: { duplicateOfUploadId: string; status: CustomerOrderUploadStatus };
} {
  return (
    err instanceof CustomerOrderUploadError &&
    err.status === 409 &&
    typeof err.details?.duplicateOfUploadId === 'string'
  );
}

export function useUploadOrderFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UploadFileVars) => {
      const fd = new FormData();
      fd.append('file', vars.file);
      fd.append('source', vars.source);
      if (vars.sourceMetadata) {
        fd.append('sourceMetadata', JSON.stringify(vars.sourceMetadata));
      }
      const token = localStorage.getItem('runq-token');
      const res = await fetch('/api/v1/ar/po-uploads', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new CustomerOrderUploadError(
          body.message || `Upload failed (${res.status})`,
          res.status,
          body.error,
          body.details,
        );
      }
      return (await res.json()) as ApiSuccess<UploadResultRow>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all }),
  });
}

interface UploadTextVars {
  text: string;
  sourceMetadata?: Record<string, unknown>;
}

export function useUploadOrderText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: UploadTextVars) =>
      api.post<ApiSuccess<UploadResultRow>>('/ar/po-uploads/text', {
        text: vars.text,
        source: 'paste_text',
        sourceMetadata: vars.sourceMetadata,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all }),
  });
}

export function useReparseOrderUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.post<ApiSuccess<UploadResultRow>>(`/ar/po-uploads/${uploadId}/reparse`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all }),
  });
}

// ─── Review screen mutations ────────────────────────────────────────────

export interface UpdatePoDraftInput {
  customerId?: string | null;
  poNumberExtracted?: string | null;
  poDate?: string | null;
  deliveryDate?: string | null;
}

export function useUpdateOrderDraft(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdatePoDraftInput) =>
      api.patch<ApiSuccess<CustomerOrderDetail>>(`/ar/po-drafts/${uploadId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all });
    },
  });
}

export interface UpdatePoDraftLineInput {
  matchedItemId?: string | null;
  quantity?: number | null;
  rate?: number | null;
  recordAlias?: boolean;
}

export function useUpdateOrderDraftLine(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { lineId: string; data: UpdatePoDraftLineInput }) =>
      api.patch<ApiSuccess<CustomerOrderDetail>>(`/ar/po-drafts/${uploadId}/lines/${vars.lineId}`, vars.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all });
    },
  });
}

export function useApproveOrderDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.post<ApiSuccess<{ invoiceId: string; invoiceNumber: string }>>(
        `/ar/po-drafts/${uploadId}/approve`,
      ),
    onSuccess: (_res, uploadId) => {
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRejectOrderDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { uploadId: string; reason: string }) =>
      api.post<ApiSuccess<CustomerOrderDetail>>(`/ar/po-drafts/${vars.uploadId}/reject`, {
        reason: vars.reason,
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.detail(vars.uploadId) });
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all });
    },
  });
}

export interface BulkApproveResult {
  created: Array<{ uploadId: string; invoiceId: string; invoiceNumber: string }>;
  failed: Array<{ uploadId: string; reason: string }>;
}

export function useDiscardOrderUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/po-uploads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all }),
  });
}

export function useBulkApproveOrderDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadIds: string[]) =>
      api.post<ApiSuccess<BulkApproveResult>>('/ar/po-drafts/bulk-approve', { uploadIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_ORDER_KEYS.all });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
