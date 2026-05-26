import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';
import type {
  CreateVendorCatalogItemInput,
  UpdateVendorCatalogItemInput,
} from '@runq/validators';

/**
 * Vendor catalog hooks. Spec: `docs/ap-pattern-b-spec.md` §4 + §10.
 *
 * Catalog is vendor-scoped; the picker on bill/PO lines reads via this
 * same `useVendorCatalog` query so the admin page and the inline pickers
 * stay coherent after manual edits.
 */

export interface VendorCatalogItem {
  id: string;
  tenantId: string;
  vendorId: string;
  description: string;
  normalizedDescription: string;
  defaultUom: string | null;
  defaultRate: string | null;
  hsnSacCode: string | null;
  defaultTaxRate: string | null;
  defaultTaxCategory: string | null;
  inventoryItemId: string | null;
  useCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorCatalogPriceHistoryRow {
  id: string;
  tenantId: string;
  catalogItemId: string;
  rate: string;
  sourceDocType: 'po' | 'bill' | 'manual';
  sourceDocId: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface VendorCatalogSuggestion {
  description: string;
  normalizedDescription: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  sampleHsnSac: string | null;
  sampleUnitPrice: string | null;
}

const CATALOG_KEYS = {
  all: (vendorId: string) => ['vendor-catalog', vendorId] as const,
  list: (vendorId: string, q?: string) => ['vendor-catalog', vendorId, 'list', q] as const,
  suggestions: (vendorId: string) => ['vendor-catalog', vendorId, 'suggestions'] as const,
  history: (vendorId: string, itemId: string) => ['vendor-catalog', vendorId, 'history', itemId] as const,
};

export function useVendorCatalog(vendorId: string, q?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const qs = params.toString();
  return useQuery({
    queryKey: CATALOG_KEYS.list(vendorId, q),
    queryFn: () => api.get<ApiSuccess<VendorCatalogItem[]>>(
      `/ap/vendors/${vendorId}/catalog${qs ? `?${qs}` : ''}`,
    ),
    enabled: !!vendorId,
  });
}

export function useVendorCatalogSuggestions(vendorId: string) {
  return useQuery({
    queryKey: CATALOG_KEYS.suggestions(vendorId),
    queryFn: () => api.get<ApiSuccess<VendorCatalogSuggestion[]>>(
      `/ap/vendors/${vendorId}/catalog/suggestions`,
    ),
    enabled: !!vendorId,
    // Suggestions are mined from history; refresh once per session.
    staleTime: 5 * 60_000,
  });
}

export function useVendorCatalogPriceHistory(vendorId: string, itemId: string | null) {
  return useQuery({
    queryKey: CATALOG_KEYS.history(vendorId, itemId ?? ''),
    queryFn: () => api.get<ApiSuccess<VendorCatalogPriceHistoryRow[]>>(
      `/ap/vendors/${vendorId}/catalog/${itemId}/price-history`,
    ),
    enabled: !!(vendorId && itemId),
  });
}

export function useCreateVendorCatalogItem(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVendorCatalogItemInput) =>
      api.post<ApiSuccess<VendorCatalogItem>>(`/ap/vendors/${vendorId}/catalog`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEYS.all(vendorId) }),
  });
}

export function useUpdateVendorCatalogItem(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: UpdateVendorCatalogItemInput }) =>
      api.patch<ApiSuccess<VendorCatalogItem>>(`/ap/vendors/${vendorId}/catalog/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEYS.all(vendorId) }),
  });
}
