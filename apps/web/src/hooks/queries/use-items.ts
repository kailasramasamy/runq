import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const ITEM_KEYS = {
  all: ['items'] as const,
  list: (filters?: Record<string, unknown>) => ['items', 'list', filters] as const,
  detail: (id: string) => ['items', 'detail', id] as const,
};

interface ItemFilters {
  type?: 'product' | 'service';
  status?: 'active' | 'inactive';
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface Item {
  id: string;
  name: string;
  sku: string | null;
  type: 'product' | 'service';
  hsnSacCode: string | null;
  unit: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  gstRate: number | null;
  category: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useItems(filters?: ItemFilters) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ITEM_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<Item[]>>(`/masters/items${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateItemInput {
  name: string;
  sku?: string;
  type: 'product' | 'service';
  hsnSacCode?: string;
  unit?: string;
  defaultSellingPrice?: number;
  defaultPurchasePrice?: number;
  gstRate?: number;
  category?: string;
  description?: string;
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemInput) =>
      api.post<ApiSuccess<Item>>('/masters/items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateItemInput> }) =>
      api.put<ApiSuccess<Item>>(`/masters/items/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: ITEM_KEYS.detail(id) });
    },
  });
}

export function useToggleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<Item>>(`/masters/items/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
  });
}
