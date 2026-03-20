import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { BankTransaction, BankStatementImportResult } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';

const TXN_KEYS = {
  all: ['bank-transactions'] as const,
  list: (filters?: Record<string, unknown>) => ['bank-transactions', 'list', filters] as const,
};

interface TransactionFilters {
  accountId: string;
  type?: 'credit' | 'debit';
  reconciled?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useBankTransactions(filters?: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.reconciled !== undefined) params.set('reconciled', String(filters.reconciled));
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  const accountId = filters?.accountId ?? '';

  return useQuery({
    queryKey: TXN_KEYS.list(filters),
    queryFn: () =>
      api.get<PaginatedResponse<BankTransaction>>(
        `/banking/accounts/${accountId}/transactions${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!accountId,
  });
}

export function useImportTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, csvData }: { accountId: string; csvData: string }) =>
      api.post<ApiSuccess<BankStatementImportResult>>(
        `/banking/accounts/${accountId}/import`,
        { csvData },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: TXN_KEYS.all }),
  });
}
