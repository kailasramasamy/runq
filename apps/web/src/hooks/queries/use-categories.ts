import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const CATEGORY_KEYS = {
  all: ['categories'] as const,
  list: (filters?: Record<string, unknown>) => ['categories', 'list', filters] as const,
  tree: () => ['categories', 'tree'] as const,
};

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  parentName?: string | null;
  defaultHsnSac: string | null;
  defaultGstRate: number | null;
  sortOrder: number;
  isActive: boolean;
  subcategories?: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
  defaultHsnSac?: string | null;
  defaultGstRate?: number | null;
  sortOrder?: number;
}

interface CategoryFilters {
  search?: string;
  parentId?: string;
  rootOnly?: boolean;
  [key: string]: unknown;
}

export function useCategories(filters?: CategoryFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.parentId) params.set('parentId', filters.parentId);
  if (filters?.rootOnly) params.set('rootOnly', 'true');
  const qs = params.toString();

  return useQuery({
    queryKey: CATEGORY_KEYS.list(filters),
    queryFn: () => api.get<{ data: Category[] }>(`/masters/categories${qs ? `?${qs}` : ''}`),
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: CATEGORY_KEYS.tree(),
    queryFn: () => api.get<{ data: Category[] }>('/masters/categories/tree'),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryInput) =>
      api.post<{ data: Category }>('/masters/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCategoryInput> }) =>
      api.put<{ data: Category }>(`/masters/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}

export function useToggleCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<{ data: Category }>(`/masters/categories/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/masters/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}
