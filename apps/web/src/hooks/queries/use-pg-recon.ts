import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PGGateway = 'razorpay' | 'phonepe' | 'paytm';
export type PGLineStatus = 'unmatched' | 'matched' | 'disputed';

export interface PGSettlementLine {
  id: string;
  orderId: string;
  transactionId: string;
  date: string;
  gross: number;
  fee: number;
  net: number;
  status: PGLineStatus;
}

export interface PGSettlement {
  id: string;
  gateway: PGGateway;
  date: string;
  gross: number;
  fees: number;
  net: number;
  totalLines: number;
  matchedLines: number;
  lines?: PGSettlementLine[];
}

export interface PGSettlementsFilters {
  gateway?: PGGateway | 'all';
  from?: string;
  to?: string;
  page?: number;
}

export interface PGImportResult {
  settlementId: string;
  imported: number;
  totalAmount: number;
  errors: Array<{ row: number; message: string }>;
}

export interface PGReconcileResult {
  matched: number;
  unmatched: number;
  disputed: number;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

const PG_KEYS = {
  all: ['pg-recon'] as const,
  settlements: (filters?: PGSettlementsFilters) =>
    ['pg-recon', 'settlements', filters] as const,
  settlement: (id: string) => ['pg-recon', 'settlements', id] as const,
  unmatched: (id: string) => ['pg-recon', 'settlements', id, 'unmatched'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePGSettlements(filters?: PGSettlementsFilters) {
  const params = new URLSearchParams();
  if (filters?.gateway && filters.gateway !== 'all') params.set('gateway', filters.gateway);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.page) params.set('page', String(filters.page));
  const qs = params.toString();

  return useQuery({
    queryKey: PG_KEYS.settlements(filters),
    queryFn: () =>
      api.get<ApiSuccess<{ data: PGSettlement[]; total: number; page: number; pageSize: number }>>(
        `/pg-recon/pg-settlements${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function usePGSettlement(id: string) {
  return useQuery({
    queryKey: PG_KEYS.settlement(id),
    queryFn: () => api.get<ApiSuccess<PGSettlement>>(`/pg-recon/pg-settlements/${id}`),
    enabled: !!id,
  });
}

export function useImportPGSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { gateway: PGGateway; csvData: string }) =>
      api.post<ApiSuccess<PGImportResult>>('/pg-recon/pg-settlements/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PG_KEYS.all }),
  });
}

export function useReconcilePGSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<PGReconcileResult>>(`/pg-recon/pg-settlements/${id}/reconcile`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PG_KEYS.all }),
  });
}

export function usePGUnmatched(id: string) {
  return useQuery({
    queryKey: PG_KEYS.unmatched(id),
    queryFn: () =>
      api.get<ApiSuccess<PGSettlementLine[]>>(`/pg-recon/pg-settlements/${id}/unmatched`),
    enabled: !!id,
  });
}
