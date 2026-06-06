import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { BomWithLines, BomListRow } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateBomInput, UpdateBomInput, BomFilter } from '@runq/validators';

interface BomListFilters extends Partial<BomFilter> {
  page?: number;
  limit?: number;
}

export const BOM_KEYS = {
  all: ['boms'] as const,
  list: (filters?: BomListFilters) => ['boms', 'list', filters] as const,
  detail: (id: string) => ['boms', 'detail', id] as const,
};

export function useBoms(filters?: BomListFilters) {
  const params = new URLSearchParams();
  if (filters?.outputItemId) params.set('outputItemId', filters.outputItemId);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: BOM_KEYS.list(filters),
    queryFn: () =>
      api.get<PaginatedResponse<BomListRow>>(
        `/manufacturing/boms${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useBom(id: string) {
  return useQuery({
    queryKey: BOM_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<BomWithLines>>(`/manufacturing/boms/${id}`),
    enabled: !!id,
  });
}

export function useCreateBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBomInput) =>
      api.post<ApiSuccess<BomWithLines>>('/manufacturing/boms', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOM_KEYS.all }),
  });
}

export function useUpdateBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBomInput }) =>
      api.put<ApiSuccess<BomWithLines>>(`/manufacturing/boms/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: BOM_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: BOM_KEYS.all });
    },
  });
}

export function useCloneBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<BomWithLines>>(`/manufacturing/boms/${id}/clone`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOM_KEYS.all }),
  });
}

export function useActivateBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<BomWithLines>>(`/manufacturing/boms/${id}/activate`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: BOM_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: BOM_KEYS.all });
    },
  });
}

export function useDeactivateBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<BomWithLines>>(`/manufacturing/boms/${id}/deactivate`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: BOM_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: BOM_KEYS.all });
    },
  });
}

export function useDeleteBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/manufacturing/boms/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: BOM_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: BOM_KEYS.all });
    },
  });
}
