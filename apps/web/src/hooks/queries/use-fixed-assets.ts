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

const FA_KEYS = {
  all: ['fixed-assets'] as const,
  categories: ['fixed-assets', 'categories'] as const,
  assets: (filters?: Record<string, string>) => ['fixed-assets', 'assets', filters] as const,
  asset: (id: string) => ['fixed-assets', 'asset', id] as const,
  depPreview: (periodEnd: string, type: string) => ['fixed-assets', 'dep-preview', periodEnd, type] as const,
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
