import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const PO_INBOX_KEYS = {
  all: ['po-inbox'] as const,
  list: (filters?: Record<string, unknown>) => ['po-inbox', 'list', filters] as const,
  detail: (id: string) => ['po-inbox', 'detail', id] as const,
};

export type PoSourceChannel =
  | 'share_sheet'
  | 'web_drop'
  | 'web_upload'
  | 'paste_image'
  | 'paste_text'
  | 'email_forward';

export type PoUploadStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'parse_error'
  | 'discarded';

export type PoDraftReviewStatus =
  | 'parsing'
  | 'ready'
  | 'needs_review'
  | 'error'
  | 'approved'
  | 'rejected';

export type PoInboxFilterStatus =
  | 'all'
  | 'pending'
  | 'ready'
  | 'needs_review'
  | 'error'
  | 'approved'
  | 'rejected';

export interface PoInboxRow {
  id: string;
  draftId: string | null;
  source: PoSourceChannel;
  uploadStatus: PoUploadStatus;
  reviewStatus: PoDraftReviewStatus | null;
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

export interface PoInboxListResponse {
  data: PoInboxRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface PoInboxFilters {
  status?: PoInboxFilterStatus;
  customerId?: string;
  source?: PoSourceChannel;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function usePoInbox(filters?: PoInboxFilters) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.source) params.set('source', filters.source);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: PO_INBOX_KEYS.list(filters),
    queryFn: () => api.get<PoInboxListResponse>(`/ar/po-drafts${qs ? `?${qs}` : ''}`),
    // Auto-refresh every 5s while parsing rows are present (Phase 2 will use this).
    refetchInterval: 5000,
  });
}

export interface PoInboxLineRaw {
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
}

export interface PoInboxDetail extends PoInboxRow {
  sourceMetadata: unknown;
  customerMatchSource: string | null;
  customerMatchConfidence: string | null;
  buyerGstinRaw: string | null;
  deliveryDate: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  reviewFlags: unknown;
  approvedInvoiceId: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  llmModel: string | null;
  rawText: string | null;
  lines: PoInboxLineRaw[];
}

export function usePoInboxItem(id: string | null) {
  return useQuery({
    queryKey: PO_INBOX_KEYS.detail(id ?? ''),
    queryFn: () => api.get<ApiSuccess<PoInboxDetail>>(`/ar/po-drafts/${id}`),
    enabled: !!id,
  });
}

interface UploadFileVars {
  file: File;
  source: PoSourceChannel;
  sourceMetadata?: Record<string, unknown>;
}

interface UploadResultRow {
  id: string;
  status: PoUploadStatus;
}

export function useUploadPoFile() {
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
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      return (await res.json()) as ApiSuccess<UploadResultRow>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all }),
  });
}

interface UploadTextVars {
  text: string;
  sourceMetadata?: Record<string, unknown>;
}

export function useUploadPoText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: UploadTextVars) =>
      api.post<ApiSuccess<UploadResultRow>>('/ar/po-uploads/text', {
        text: vars.text,
        source: 'paste_text',
        sourceMetadata: vars.sourceMetadata,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all }),
  });
}

export function useReparsePoUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.post<ApiSuccess<UploadResultRow>>(`/ar/po-uploads/${uploadId}/reparse`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all }),
  });
}

// ─── Review screen mutations ────────────────────────────────────────────

export interface UpdatePoDraftInput {
  customerId?: string | null;
  poNumberExtracted?: string | null;
  poDate?: string | null;
  deliveryDate?: string | null;
}

export function useUpdatePoDraft(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdatePoDraftInput) =>
      api.patch<ApiSuccess<PoInboxDetail>>(`/ar/po-drafts/${uploadId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all });
    },
  });
}

export interface UpdatePoDraftLineInput {
  matchedItemId?: string | null;
  quantity?: number | null;
  rate?: number | null;
  recordAlias?: boolean;
}

export function useUpdatePoDraftLine(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { lineId: string; data: UpdatePoDraftLineInput }) =>
      api.patch<ApiSuccess<PoInboxDetail>>(`/ar/po-drafts/${uploadId}/lines/${vars.lineId}`, vars.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all });
    },
  });
}

export function useApprovePoDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.post<ApiSuccess<{ invoiceId: string; invoiceNumber: string }>>(
        `/ar/po-drafts/${uploadId}/approve`,
      ),
    onSuccess: (_res, uploadId) => {
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.detail(uploadId) });
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRejectPoDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { uploadId: string; reason: string }) =>
      api.post<ApiSuccess<PoInboxDetail>>(`/ar/po-drafts/${vars.uploadId}/reject`, {
        reason: vars.reason,
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.detail(vars.uploadId) });
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all });
    },
  });
}

export interface BulkApproveResult {
  created: Array<{ uploadId: string; invoiceId: string; invoiceNumber: string }>;
  failed: Array<{ uploadId: string; reason: string }>;
}

export function useDiscardPoUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/po-uploads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all }),
  });
}

export function useBulkApprovePoDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadIds: string[]) =>
      api.post<ApiSuccess<BulkApproveResult>>('/ar/po-drafts/bulk-approve', { uploadIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PO_INBOX_KEYS.all });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
