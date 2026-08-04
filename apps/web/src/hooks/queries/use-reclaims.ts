import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';
import type { CreateReclaimInput } from '@runq/validators';

/**
 * Reclaim — finished goods torn back down to raw material (cutting open
 * unsold packets so the milk can go into paneer or curd).
 */

export type ReclaimStatus = 'draft' | 'posted' | 'cancelled';

export interface Reclaim {
  id: string;
  reclaimNo: string;
  warehouseId: string;
  warehouseName: string;
  reclaimDate: string;
  status: ReclaimStatus;
  notes: string | null;
  fgValue: string;
  recoveredValue: string;
  lossValue: string;
  journalEntryId: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface ReclaimLine {
  id: string;
  fgItemId: string;
  fgItemName: string;
  fgItemSku: string | null;
  fgBatchNo: string | null;
  fgQty: string;
  fgUnitCost: string;
  fgValue: string;
  recoveredItemId: string;
  recoveredItemName: string;
  recoveredItemSku: string | null;
  recoveredUom: string;
  recoveredBatchNo: string | null;
  recoveredQty: string;
  recoveredUnitCost: string;
  recoveredValue: string;
  expiryDate: string | null;
  notes: string | null;
}

export interface ReclaimDetail extends Reclaim { lines: ReclaimLine[] }

export interface PostReclaimResult { data: Reclaim; warnings: string[] }

export const RECLAIM_KEYS = {
  all: ['mfg', 'reclaims'] as const,
  list: (f?: Record<string, unknown>) => ['mfg', 'reclaims', 'list', f] as const,
  detail: (id: string) => ['mfg', 'reclaims', id] as const,
};

interface ReclaimListResponse {
  data: Reclaim[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function qs(filter: Record<string, unknown>) {
  const entries = Object.entries(filter).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

export function useReclaimList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: RECLAIM_KEYS.list(filter),
    queryFn: () => api.get<ReclaimListResponse>(`/manufacturing/reclaims${qs(filter)}`),
  });
}

export function useReclaim(id: string) {
  return useQuery({
    queryKey: RECLAIM_KEYS.detail(id),
    queryFn: async () => (await api.get<ApiSuccess<ReclaimDetail>>(`/manufacturing/reclaims/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateReclaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateReclaimInput) =>
      (await api.post<ApiSuccess<Reclaim>>('/manufacturing/reclaims', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: RECLAIM_KEYS.all }),
  });
}

export function usePostReclaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<PostReclaimResult>(`/manufacturing/reclaims/${id}/post`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECLAIM_KEYS.all }),
  });
}

export function useCancelReclaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<ApiSuccess<Reclaim>>(`/manufacturing/reclaims/${id}/cancel`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECLAIM_KEYS.all }),
  });
}
