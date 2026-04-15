import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { BankTransaction, AutoReconciliationResult, ReconciliationMatch } from '@runq/types';
import type { ApiSuccess } from '@runq/types';
import type { ManualMatchInput, AutoReconcileInput } from '@runq/validators';

export interface UnreconciledResult {
  unreconciledBankTxns: BankTransaction[];
  unreconciledPayments: unknown[];
  unreconciledReceipts: unknown[];
  suggestedMatches: Array<{ transactionId: string; suggestions: Array<{ paymentId?: string; receiptId?: string; confidence: number; matchReason: string }> }>;
  summary: { bankBalance: number; bookBalance: number; difference: number };
}

export interface MatchedTransaction {
  matchId: string;
  matchType: string;
  matchedAt: string;
  bankTransactionId: string;
  date: string;
  narration: string | null;
  amount: number;
  type: 'credit' | 'debit';
  reference: string | null;
}

const RECON_KEYS = {
  all: ['reconciliation'] as const,
  unreconciled: (accountId?: string) => ['reconciliation', 'unreconciled', accountId] as const,
  matched: (accountId?: string) => ['reconciliation', 'matched', accountId] as const,
  matches: ['reconciliation', 'matches'] as const,
};

export function useUnreconciled(accountId?: string) {
  return useQuery({
    queryKey: RECON_KEYS.unreconciled(accountId),
    queryFn: () =>
      api.get<ApiSuccess<UnreconciledResult>>(`/banking/accounts/${accountId}/reconciliation`),
    enabled: !!accountId,
  });
}

export function useAutoReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, data }: { accountId: string; data: AutoReconcileInput }) =>
      api.post<ApiSuccess<AutoReconciliationResult>>(`/banking/accounts/${accountId}/reconcile/auto`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECON_KEYS.all }),
  });
}

export function useManualMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ManualMatchInput) =>
      api.post<ApiSuccess<ReconciliationMatch>>('/banking/reconciliation/match', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECON_KEYS.all }),
  });
}

export function useUnmatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bankTransactionId: string) =>
      api.post<ApiSuccess<null>>('/banking/reconciliation/unmatch', { bankTransactionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECON_KEYS.all }),
  });
}

export function useMatchedTransactions(accountId?: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: [...RECON_KEYS.matched(accountId), page, limit],
    queryFn: () =>
      api.get<{ data: MatchedTransaction[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
        `/banking/accounts/${accountId}/reconciliation/matched?page=${page}&limit=${limit}`,
      ),
    enabled: !!accountId,
  });
}

export function usePostAsExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bankTransactionId: string; expenseAccountCode: string; narration?: string }) =>
      api.post<ApiSuccess<ReconciliationMatch>>('/banking/reconciliation/post-expense', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECON_KEYS.all }),
  });
}
