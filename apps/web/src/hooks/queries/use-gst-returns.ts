import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// ── Types (inline — matches API response) ──────────────────────────────

export interface GstReturn {
  id: string;
  tenantId: string;
  gstin: string;
  returnType: 'gstr1' | 'gstr3b';
  period: string;       // MMYYYY
  filingFrequency: 'monthly' | 'quarterly';
  status: 'draft' | 'validated' | 'uploaded' | 'filed' | 'error';
  data: unknown;
  errorDetails: Array<{ code: string; message: string; section?: string }> | null;
  arn: string | null;
  filedAt: string | null;
  filedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    section: string;
    field: string;
    message: string;
    invoiceNumber?: string;
  }>;
}

export interface Gstr1Summary {
  b2b: { count: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  b2cs: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  b2cl: { count: number; taxableValue: number; igst: number };
  cdn: { count: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  hsn: { count: number };
  docs: { count: number };
}

// ── Query Keys ─────────────────────────────────────────────────────────

const GST_KEYS = {
  all: ['gst-returns'] as const,
  list: (filters?: Record<string, string>) => ['gst-returns', 'list', filters] as const,
  detail: (id: string) => ['gst-returns', 'detail', id] as const,
  summary: (id: string) => ['gst-returns', 'summary', id] as const,
};

// ── Queries ────────────────────────────────────────────────────────────

export function useGstReturns(filters?: { returnType?: string }) {
  const qs = filters?.returnType ? `?returnType=${filters.returnType}` : '';
  return useQuery({
    queryKey: GST_KEYS.list(filters as Record<string, string>),
    queryFn: () => api.get<ApiSuccess<GstReturn[]>>(`/gst/returns${qs}`),
  });
}

export function useGstReturn(id: string) {
  return useQuery({
    queryKey: GST_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<GstReturn>>(`/gst/returns/${id}`),
    enabled: !!id,
  });
}

export function useGstnSummary(id: string, enabled: boolean) {
  return useQuery({
    queryKey: GST_KEYS.summary(id),
    queryFn: () => api.get<ApiSuccess<Gstr1Summary>>(`/gst/returns/${id}/summary`),
    enabled: enabled && !!id,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────

export function useGenerateGstr1() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.post<ApiSuccess<GstReturn>>('/gst/returns/generate', { period }),
    onSuccess: () => qc.invalidateQueries({ queryKey: GST_KEYS.all }),
  });
}

export function useDeleteReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/gst/returns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: GST_KEYS.all }),
  });
}

export function useValidateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<ValidationResult>>(`/gst/returns/${id}/validate`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: GST_KEYS.detail(id) }),
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (data: { gstin: string; username: string }) =>
      api.post<ApiSuccess<{ success: boolean; message: string; txn?: string }>>('/gst/auth/request-otp', data),
  });
}

export function useForceLogout() {
  return useMutation({
    mutationFn: (data: { gstin: string; username: string }) =>
      api.post<ApiSuccess<{ success: boolean; message: string }>>('/gst/auth/force-logout', data),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (data: { gstin: string; username: string; otp: string; txn: string }) =>
      api.post<ApiSuccess<{ success: boolean; expiresAt: string }>>('/gst/auth/verify-otp', data),
  });
}

export function useUploadReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ success: boolean; errors?: Array<{ code: string; message: string }> }>>(`/gst/returns/${id}/upload`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: GST_KEYS.detail(id) }),
  });
}

export function useFileReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, evc }: { id: string; evc: string }) =>
      api.post<ApiSuccess<{ success: boolean; arn?: string }>>(`/gst/returns/${id}/file`, { evc }),
    onSuccess: () => qc.invalidateQueries({ queryKey: GST_KEYS.all }),
  });
}

// ── GSTR-3B specific ───────────────────────────────────────────────

export function useGenerateGstr3b() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.post<ApiSuccess<GstReturn>>('/gst/returns/generate-3b', { period }),
    onSuccess: () => qc.invalidateQueries({ queryKey: GST_KEYS.all }),
  });
}

export function useUpload3b() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ success: boolean; errors?: Array<{ code: string; message: string }> }>>(`/gst/returns/${id}/upload-3b`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: GST_KEYS.detail(id) }),
  });
}

export function useAutoPopulated3b(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...GST_KEYS.detail(id), 'auto-3b'] as const,
    queryFn: () => api.get<ApiSuccess<unknown>>(`/gst/returns/${id}/auto-3b`),
    enabled: enabled && !!id,
  });
}

// ── GSTR-2B Reconciliation ─────────────────────────────────────────

export interface Gstr2bMatch {
  id: string;
  supplierGstin: string;
  supplierName: string | null;
  invoiceNumber2b: string;
  invoiceDate2b: string | null;
  taxableValue2b: string;
  igst2b: string;
  cgst2b: string;
  sgst2b: string;
  purchaseInvoiceId: string | null;
  invoiceNumberBooks: string | null;
  taxableValueBooks: string | null;
  igstBooks: string | null;
  cgstBooks: string | null;
  sgstBooks: string | null;
  matchStatus: 'matched' | 'mismatched' | 'not_in_books' | 'not_in_2b';
  valueDiff: string | null;
}

export interface ReconSummary {
  matched: { count: number; taxableValue: number };
  mismatched: { count: number; taxableValue: number };
  notInBooks: { count: number; taxableValue: number };
  notIn2b: { count: number; taxableValue: number };
  totalItcAvailable: number;
  totalItcClaimable: number;
}

const RECON_KEYS = {
  matches: (period: string, status?: string) => ['gst-2b', 'matches', period, status] as const,
  summary: (period: string) => ['gst-2b', 'summary', period] as const,
};

export function usePull2b() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.post<ApiSuccess<unknown>>('/gst/2b/pull', { period }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gst-2b'] }),
  });
}

export function useReconcile2b() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.post<ApiSuccess<ReconSummary>>('/gst/2b/reconcile', { period }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gst-2b'] }),
  });
}

export function use2bMatches(period: string, status?: string) {
  const qs = status ? `&status=${status}` : '';
  return useQuery({
    queryKey: RECON_KEYS.matches(period, status),
    queryFn: () => api.get<ApiSuccess<Gstr2bMatch[]>>(`/gst/2b/matches?period=${period}${qs}`),
    enabled: !!period,
  });
}

export function use2bSummary(period: string) {
  return useQuery({
    queryKey: RECON_KEYS.summary(period),
    queryFn: () => api.get<ApiSuccess<ReconSummary>>(`/gst/2b/summary?period=${period}`),
    enabled: !!period,
  });
}
