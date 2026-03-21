import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { Vendor } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateVendorInput, UpdateVendorInput, SyncVendorsInput } from '@runq/validators';

interface SyncVendorsResult {
  created: number;
  updated: number;
  errors: Array<{ index: number; name: string; message: string }>;
}

interface ImportVendorsCSVResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

const VENDOR_KEYS = {
  all: ['vendors'] as const,
  list: (filters?: Record<string, unknown>) => ['vendors', 'list', filters] as const,
  detail: (id: string) => ['vendors', 'detail', id] as const,
};

interface VendorFilters {
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useVendors(filters?: VendorFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: VENDOR_KEYS.list(filters),
    queryFn: () => api.get<PaginatedResponse<Vendor>>(`/ap/vendors${qs ? `?${qs}` : ''}`),
  });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: VENDOR_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<Vendor>>(`/ap/vendors/${id}`),
    enabled: !!id,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVendorInput) => api.post<ApiSuccess<Vendor>>('/ap/vendors', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEYS.all }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVendorInput }) =>
      api.put<ApiSuccess<Vendor>>(`/ap/vendors/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: VENDOR_KEYS.all });
      qc.invalidateQueries({ queryKey: VENDOR_KEYS.detail(id) });
    },
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ap/vendors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEYS.all }),
  });
}

export function useSyncVendors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncVendorsInput) =>
      api.post<ApiSuccess<SyncVendorsResult>>('/ap/vendors/sync', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEYS.all }),
  });
}

export function useImportVendorsCSV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { csvData: string }) =>
      api.post<ApiSuccess<ImportVendorsCSVResult>>('/ap/vendors/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEYS.all }),
  });
}
