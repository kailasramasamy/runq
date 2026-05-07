import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

export interface BillSyncSource {
  id: string;
  slug: string;
  name: string;
  apiKeyPrefix: string;
  mode: 'api' | 'csv' | 'both';
  isActive: boolean;
  lastSyncAt: string | null;
  columnMapping: Record<string, string>;
  createdAt: string;
}

export interface BillSyncSourceWithKey extends BillSyncSource {
  apiKey: string;
}

export interface BillSyncLog {
  id: string;
  sourceId: string;
  externalId: string | null;
  action: string;
  status: string;
  billId: string | null;
  message: string | null;
  createdAt: string;
}

export interface MappingProposal {
  columnMapping: Record<string, string>;
  unmapped: string[];
  dateFormat?: 'DMY' | 'MDY' | 'YMD';
  amountFormat?: 'indian_lakh' | 'standard';
  source: 'heuristic' | 'llm' | 'mixed';
}

export interface CsvPreviewRow {
  rowNum: number;
  externalId: string;
  vendorRef: string;
  invoiceNumber: string;
  totalAmount: number;
  outcome: 'create' | 'resync' | 'unchanged' | 'invalid' | 'unknown_vendor';
  message?: string;
}

export interface CsvPreviewResult {
  bills: Array<{ externalId: string; payload: Record<string, unknown> }>;
  preview: CsvPreviewRow[];
  errors: Array<{ rowNum: number; message: string }>;
}

export interface UnmappedAttempt {
  externalRef: string;
  externalName: string | null;
  attempts: number;
  lastAttemptAt: string;
  suggestion: { id: string; name: string; matchType: 'exact' | 'ilike' | 'firstword' } | null;
  candidates: Array<{ id: string; name: string }>;
}

export interface VendorMapping {
  vendorId: string;
  vendorName: string;
  externalRef: string;
}

const KEYS = {
  list: ['bill-sync', 'sources'] as const,
  logs: (id: string) => ['bill-sync', 'logs', id] as const,
  unmapped: (id: string) => ['bill-sync', 'unmapped', id] as const,
  mappings: (id: string) => ['bill-sync', 'mappings', id] as const,
};

export function useBillSyncSources() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: () => api.get<ApiSuccess<BillSyncSource[]>>('/bill-sync/admin/sources'),
  });
}

export function useCreateBillSyncSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { slug: string; name: string; mode?: 'api' | 'csv' | 'both' }) =>
      api.post<ApiSuccess<BillSyncSourceWithKey>>('/bill-sync/admin/sources', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useRotateBillSyncKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<BillSyncSourceWithKey>>(`/bill-sync/admin/sources/${id}/rotate-key`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useToggleBillSyncSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; isActive: boolean }) =>
      api.patch(`/bill-sync/admin/sources/${data.id}/active`, { isActive: data.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useBillSyncLogs(id: string | null) {
  return useQuery({
    queryKey: KEYS.logs(id ?? ''),
    queryFn: () => api.get<ApiSuccess<BillSyncLog[]>>(`/bill-sync/admin/sources/${id}/logs`),
    enabled: !!id,
  });
}

export function useProposeMapping() {
  return useMutation({
    mutationFn: (data: { id: string; csv: string }) =>
      api.post<ApiSuccess<MappingProposal>>(`/bill-sync/admin/sources/${data.id}/propose-mapping`, { csv: data.csv }),
  });
}

export function useSaveMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; columnMapping: Record<string, string>; dateFormat?: string; amountFormat?: string }) =>
      api.put(`/bill-sync/admin/sources/${data.id}/mapping`, {
        columnMapping: data.columnMapping,
        dateFormat: data.dateFormat,
        amountFormat: data.amountFormat,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function usePreviewCsv() {
  return useMutation({
    mutationFn: (data: { id: string; csv: string }) =>
      api.post<ApiSuccess<CsvPreviewResult>>(`/bill-sync/admin/sources/${data.id}/preview`, { csv: data.csv }),
  });
}

export function useCommitCsv() {
  return useMutation({
    mutationFn: (data: { id: string; bills: CsvPreviewResult['bills'] }) =>
      api.post<ApiSuccess<{ results: Array<{ status: string; billId?: string; reason?: string }> }>>(
        `/bill-sync/admin/sources/${data.id}/commit`,
        { bills: data.bills },
      ),
  });
}

export function useUnmappedAttempts(id: string | null) {
  return useQuery({
    queryKey: KEYS.unmapped(id ?? ''),
    queryFn: () => api.get<ApiSuccess<UnmappedAttempt[]>>(`/bill-sync/admin/sources/${id}/unmapped`),
    enabled: !!id,
  });
}

export function useVendorMappings(id: string | null) {
  return useQuery({
    queryKey: KEYS.mappings(id ?? ''),
    queryFn: () => api.get<ApiSuccess<VendorMapping[]>>(`/bill-sync/admin/sources/${id}/mappings`),
    enabled: !!id,
  });
}

type MapVendorVars =
  | { id: string; vendorId: string; externalRef: string; newVendorName?: undefined }
  | { id: string; newVendorName: string; externalRef: string; category?: string; vendorId?: undefined };

export function useMapVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MapVendorVars) => {
      const body: Record<string, string> = { externalRef: data.externalRef };
      if (data.vendorId) body.vendorId = data.vendorId;
      else { body.newVendorName = data.newVendorName!; if ('category' in data && data.category) body.category = data.category; }
      return api.post(`/bill-sync/admin/sources/${data.id}/mappings`, body);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.unmapped(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.mappings(vars.id) });
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

export function useUnmapVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; vendorId: string }) =>
      api.delete(`/bill-sync/admin/sources/${data.id}/mappings/${data.vendorId}`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.unmapped(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.mappings(vars.id) });
    },
  });
}
