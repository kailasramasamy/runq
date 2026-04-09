import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const PRICE_LIST_KEYS = {
  all: ['price-lists'] as const,
  list: (filters?: Record<string, unknown>) => ['price-lists', 'list', filters] as const,
  detail: (id: string) => ['price-lists', 'detail', id] as const,
};

export interface PriceListItemRow {
  id: string;
  priceListId: string;
  itemId: string;
  itemName?: string;
  itemSku?: string | null;
  rate: number;
  marginPercent: number | null;
  discountPercent: number | null;
  minQuantity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  type: 'selling' | 'buying';
  currency: string;
  applyTo: 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor';
  applyToValue: string | null;
  customerId: string | null;
  customerName?: string | null;
  vendorId: string | null;
  vendorName?: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  items: PriceListItemRow[];
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceListItemInput {
  itemId: string;
  rate: number;
  marginPercent?: number | null;
  discountPercent?: number | null;
  minQuantity?: number | null;
}

export interface CreatePriceListInput {
  name: string;
  type: 'selling' | 'buying';
  currency?: string;
  applyTo?: 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor';
  applyToValue?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  items: PriceListItemInput[];
}

interface PriceListFilters {
  search?: string;
  type?: 'selling' | 'buying';
  applyTo?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function usePriceLists(filters?: PriceListFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.applyTo) params.set('applyTo', filters.applyTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: PRICE_LIST_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<PriceList[]>>(`/masters/price-lists${qs ? `?${qs}` : ''}`),
  });
}

export function usePriceList(id: string | null) {
  return useQuery({
    queryKey: PRICE_LIST_KEYS.detail(id!),
    queryFn: () => api.get<{ data: PriceList }>(`/masters/price-lists/${id}`),
    enabled: !!id,
  });
}

export function useCreatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePriceListInput) =>
      api.post<ApiSuccess<PriceList>>('/masters/price-lists', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICE_LIST_KEYS.all }),
  });
}

export function useUpdatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePriceListInput> }) =>
      api.put<ApiSuccess<PriceList>>(`/masters/price-lists/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: PRICE_LIST_KEYS.all });
      qc.invalidateQueries({ queryKey: PRICE_LIST_KEYS.detail(id) });
    },
  });
}

export function useTogglePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<PriceList>>(`/masters/price-lists/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICE_LIST_KEYS.all }),
  });
}

// ─── Price resolver ─────────────────────────────────────────────────────────

export type PriceSource = 'customer' | 'customer_group' | 'all' | 'item_default';

export interface ResolvedPrice {
  rate: number;
  effectiveRate: number;
  discountPercent: number | null;
  source: PriceSource;
  priceListId: string | null;
  priceListName: string | null;
}

/**
 * Imperative price lookup. Returns null if either id is missing — the caller
 * usually has them as form state and passes null until both are populated.
 */
export async function resolvePrice(args: {
  customerId: string;
  itemId: string;
  quantity?: number;
}): Promise<ResolvedPrice | null> {
  if (!args.customerId || !args.itemId) return null;
  const params = new URLSearchParams();
  params.set('customerId', args.customerId);
  params.set('itemId', args.itemId);
  if (args.quantity != null) params.set('quantity', String(args.quantity));
  const res = await api.get<ApiSuccess<ResolvedPrice>>(`/masters/price-lists/resolve?${params.toString()}`);
  return res.data;
}
