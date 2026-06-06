import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess, PaginatedResponse } from '@runq/types';
import type { CreateDirectReceiptInput } from '@runq/validators';

/**
 * PP Phase 4 — Direct Receipt hooks.
 */

export interface DirectReceiptRow {
  id: string;
  grnNo: string;
  warehouseId: string;
  warehouseName: string;
  inventoryItemId: string;
  itemName: string;
  receivedAt: string;
  qty: number;
  unitRate: number;
  lineTotal: number;
  sourceLabel: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  vehicleNo: string | null;
  lrNo: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

interface Filters {
  warehouseId?: string;
  inventoryItemId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

const KEYS = {
  all: ['direct-receipts'] as const,
  list: (f?: Filters) => ['direct-receipts', 'list', f] as const,
};

export function useDirectReceipts(filters?: Filters) {
  const params = new URLSearchParams();
  if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId);
  if (filters?.inventoryItemId) params.set('inventoryItemId', filters.inventoryItemId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: () => api.get<PaginatedResponse<DirectReceiptRow>>(
      `/purchase/direct-receipts${qs ? `?${qs}` : ''}`,
    ),
  });
}

export function useCreateDirectReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDirectReceiptInput) =>
      api.post<ApiSuccess<{ id: string; grnNo: string }>>('/purchase/direct-receipts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      // Open-batches drives the BatchPicker chips — a fresh receipt
      // creates / grows a batch, so its cache is stale immediately.
      qc.invalidateQueries({ queryKey: ['open-batches'] });
    },
  });
}

export function useCancelDirectReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/purchase/direct-receipts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      // Open-batches drives the BatchPicker chips — a fresh receipt
      // creates / grows a batch, so its cache is stale immediately.
      qc.invalidateQueries({ queryKey: ['open-batches'] });
    },
  });
}
