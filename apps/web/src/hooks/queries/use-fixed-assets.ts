import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  AssetCategory, FixedAsset, FixedAssetWithDepreciation,
  DepreciationPreviewLine, DepreciationRunResult,
  PaginatedResponse, ApiSuccess,
} from '@runq/types';
import type {
  CreateAssetCategoryInput, UpdateAssetCategoryInput,
  CreateFixedAssetInput, UpdateFixedAssetInput,
} from '@runq/validators';

const BASE_URL = '/api/v1';

const FA_KEYS = {
  all: ['fixed-assets'] as const,
  categories: ['fixed-assets', 'categories'] as const,
  assets: (filters?: Record<string, string>) => ['fixed-assets', 'assets', filters] as const,
  asset: (id: string) => ['fixed-assets', 'asset', id] as const,
  depPreview: (periodEnd: string, type: string) => ['fixed-assets', 'dep-preview', periodEnd, type] as const,
  blockOfAssets: (fy: string) => ['fixed-assets', 'block-of-assets', fy] as const,
};

// ─── Categories ───────────────────────────────────────────────────────────

export function useAssetCategories() {
  return useQuery({
    queryKey: FA_KEYS.categories,
    queryFn: () => api.get<ApiSuccess<AssetCategory[]>>('/fa/categories'),
  });
}

export function useCreateAssetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAssetCategoryInput) =>
      api.post<ApiSuccess<AssetCategory>>('/fa/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FA_KEYS.categories }),
  });
}

export function useUpdateAssetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetCategoryInput }) =>
      api.put<ApiSuccess<AssetCategory>>(`/fa/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FA_KEYS.categories }),
  });
}

// ─── Assets ───────────────────────────────────────────────────────────────

export function useFixedAssets(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters);
  const qs = params.toString();
  return useQuery({
    queryKey: FA_KEYS.assets(filters),
    queryFn: () => api.get<PaginatedResponse<FixedAsset>>(`/fa${qs ? `?${qs}` : ''}`),
  });
}

export function useFixedAsset(id: string) {
  return useQuery({
    queryKey: FA_KEYS.asset(id),
    queryFn: () => api.get<ApiSuccess<FixedAssetWithDepreciation>>(`/fa/${id}`),
    enabled: !!id,
  });
}

export function useCreateFixedAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFixedAssetInput) =>
      api.post<ApiSuccess<FixedAsset>>('/fa', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FA_KEYS.all }),
  });
}

export function useUpdateFixedAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFixedAssetInput }) =>
      api.put<ApiSuccess<FixedAsset>>(`/fa/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: FA_KEYS.all });
      qc.invalidateQueries({ queryKey: FA_KEYS.asset(id) });
    },
  });
}

// ─── Depreciation ─────────────────────────────────────────────────────────

export function useDepreciationPreview(periodEnd: string, depType: string) {
  return useQuery({
    queryKey: FA_KEYS.depPreview(periodEnd, depType),
    queryFn: () =>
      api.get<ApiSuccess<DepreciationPreviewLine[]>>(
        `/fa/depreciation/preview?periodEnd=${periodEnd}&depreciationType=${depType}`,
      ),
    enabled: !!periodEnd,
  });
}

export function useRunDepreciation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { periodEnd: string; depreciationType: string }) =>
      api.post<ApiSuccess<DepreciationRunResult>>('/fa/depreciation/run', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FA_KEYS.all }),
  });
}

// ─── Dispose / Transfer / Block / Import ──────────────────────────────────────

export function useDisposeAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { disposalDate: string; disposalAmount: number; disposalNotes?: string } }) =>
      api.post<ApiSuccess<unknown>>(`/fa/${id}/dispose`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: FA_KEYS.all });
      qc.invalidateQueries({ queryKey: FA_KEYS.asset(id) });
    },
  });
}

export function useTransferAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { toLocation: string; transferDate: string; notes?: string } }) =>
      api.post<ApiSuccess<unknown>>(`/fa/${id}/transfer`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: FA_KEYS.all });
      qc.invalidateQueries({ queryKey: FA_KEYS.asset(id) });
    },
  });
}

export function useBlockOfAssets(financialYear: string) {
  return useQuery({
    queryKey: FA_KEYS.blockOfAssets(financialYear),
    queryFn: () =>
      api.get<ApiSuccess<unknown[]>>(`/fa/depreciation/block-of-assets?financialYear=${financialYear}`),
    enabled: !!financialYear,
  });
}

export function useImportAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = (api as any).token as string | null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${BASE_URL}/fa/import`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      return response.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FA_KEYS.all }),
  });
}
