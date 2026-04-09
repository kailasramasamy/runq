import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess, PaginatedResponse } from '@runq/types';

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

export interface CogmComponent {
  label: string;
  amount: number;
  note?: string;
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
  mrp: number | null;
  costPrice: number | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  // Extended supplier-catalogue attributes
  ean: string | null;
  margin: number | null;
  brand: string | null;
  grammage: string | null;
  packingType: string | null;
  basicPrice: number | null;
  gstValue: number | null;
  shelfLifeDays: number | null;
  rtvAllowed: boolean | null;
  vendorPackSize: string | null;
  packagingDimension: string | null;
  temperature: string | null;
  cutoffTime: string | null;
  productType: string | null;
  cogmBreakdown: CogmComponent[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: ITEM_KEYS.detail(id ?? ''),
    queryFn: () => api.get<ApiSuccess<Item>>(`/masters/items/${id}`),
    enabled: !!id,
  });
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
    queryFn: () => api.get<PaginatedResponse<Item>>(`/masters/items${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateItemInput {
  name: string;
  sku?: string | null;
  type: 'product' | 'service';
  hsnSacCode?: string | null;
  unit?: string | null;
  defaultSellingPrice?: number | null;
  defaultPurchasePrice?: number | null;
  gstRate?: number | null;
  mrp?: number | null;
  costPrice?: number | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  // Extended supplier-catalogue attributes
  ean?: string | null;
  margin?: number | null;
  brand?: string | null;
  grammage?: string | null;
  packingType?: string | null;
  basicPrice?: number | null;
  gstValue?: number | null;
  shelfLifeDays?: number | null;
  rtvAllowed?: boolean | null;
  vendorPackSize?: string | null;
  packagingDimension?: string | null;
  temperature?: string | null;
  cutoffTime?: string | null;
  productType?: string | null;
  cogmBreakdown?: CogmComponent[] | null;
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

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/masters/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
  });
}

// ─── AI Smart Import ─────────────────────────────────────────────────────────

export interface ExtractedItem {
  name: string;
  sku: string | null;
  ean: string | null;
  type: 'product' | 'service';
  hsnSacCode: string | null;
  unit: string | null;
  grammage: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  basicPrice: number | null;
  mrp: number | null;
  costPrice: number | null;
  gstRate: number | null;
  gstValue: number | null;
  margin: number | null;
  brand: string | null;
  packingType: string | null;
  shelfLifeDays: number | null;
  rtvAllowed: boolean | null;
  vendorPackSize: string | null;
  packagingDimension: string | null;
  temperature: string | null;
  cutoffTime: string | null;
  productType: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  notes: string;
  confidence: number;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

export function useExtractItemsFromFile() {
  return useMutation<ApiSuccess<ExtractionResult>, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('runq-token');
      const res = await fetch('/api/v1/masters/items/extract', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Extraction failed' }));
        throw new Error(err.message ?? 'Extraction failed');
      }
      return res.json();
    },
  });
}

export function useBulkCreateItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { items: CreateItemInput[]; mode: 'skip' | 'overwrite' }) =>
      api.post<ApiSuccess<BulkImportResult>>('/masters/items/bulk-create', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      // Bulk import auto-creates any referenced categories/subcategories,
      // so refresh the category tree the edit dialog uses.
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
