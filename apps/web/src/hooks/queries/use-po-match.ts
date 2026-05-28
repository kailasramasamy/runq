import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';
import type { CommitMatchInput } from '@runq/validators';

/**
 * PP Phase 3 — 3-way match hooks consumed by the AP bill-side UI.
 */

export interface OpenPoSummary {
  id: string;
  poNumber: string;
  poDate: string;
  total: number;
  openValue: number;
  status: string;
}

export interface MatchPreview {
  billId: string;
  vendorId: string;
  openPos: OpenPoSummary[];
  matchedPoId: string | null;
  matchStatus: 'unmatched' | 'matched' | 'mismatch';
  tolerancePct: number;
  amountDelta: {
    billTotal: number;
    poOpen: number;
    absDelta: number;
    pctDelta: number;
  } | null;
  lineDeltas: unknown[];
}

const KEYS = {
  preview: (billId: string) => ['po-match-preview', billId] as const,
};

export function useMatchPreview(billId: string | undefined) {
  return useQuery({
    queryKey: KEYS.preview(billId ?? ''),
    queryFn: () => api.post<ApiSuccess<MatchPreview>>('/purchase/match/preview', { billId }),
    enabled: !!billId,
  });
}

export function useCommitMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CommitMatchInput) =>
      api.post<ApiSuccess<{ status: 'matched' | 'mismatch'; pctDelta: number }>>(
        '/purchase/match/commit',
        data,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.preview(vars.billId) });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
