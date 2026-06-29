import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  BankTransaction,
  BankStatementImportResult,
  CategorizationResult,
  StatementParseResult,
  ParsedStatementTransaction,
} from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';

const TXN_KEYS = {
  all: ['bank-transactions'] as const,
  list: (filters?: Record<string, unknown>) => ['bank-transactions', 'list', filters] as const,
};

interface TransactionFilters {
  accountId: string;
  type?: 'credit' | 'debit';
  reconciled?: boolean;
  reconStatus?: 'unreconciled' | 'matched' | 'manually_matched' | 'excluded';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  inSuspense?: boolean;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useBankTransactions(filters?: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.reconStatus) params.set('reconStatus', filters.reconStatus);
  if (filters?.reconciled !== undefined) params.set('reconciled', String(filters.reconciled));
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.inSuspense) params.set('inSuspense', 'true');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TXN_KEYS.all });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });
}

export function useCategorizeTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId }: { accountId: string }) =>
      api.post<ApiSuccess<CategorizationResult>>(
        `/banking/accounts/${accountId}/categorize`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TXN_KEYS.all });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });
}

interface SyncResult {
  imported: number;
  duplicatesSkipped: number;
}

export function useSyncTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId }: { accountId: string }) =>
      api.post<ApiSuccess<SyncResult>>(
        `/banking/accounts/${accountId}/sync`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TXN_KEYS.all });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });
}

// ── Set GL category (+ auto-reconcile + learn rule) ─────────────

export function useSetTransactionCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, glAccountId, reconcile = true, learn = true }: {
      transactionId: string;
      glAccountId: string;
      reconcile?: boolean;
      learn?: boolean;
    }) =>
      api.put<ApiSuccess<{ success: boolean }>>(
        `/banking/accounts/transactions/${transactionId}/category`,
        { glAccountId, reconcile, learn },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: TXN_KEYS.all }),
  });
}

// ── Set/clear the user memo ("paid to X for Y") ────────────────

export function useSetTransactionMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, memo }: { transactionId: string; memo: string | null }) =>
      api.patch<ApiSuccess<{ success: boolean }>>(
        `/banking/accounts/transactions/${transactionId}/memo`,
        { memo },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: TXN_KEYS.all }),
  });
}

// ── Smart statement import (file upload → parse → commit) ──────

export function useParseStatement() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const token = localStorage.getItem('runq-token');
      const res = await fetch('/api/v1/banking/statement-import/parse', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Parse failed' }));
        throw new Error(err.message || err.error || `Parse failed (${res.status})`);
      }
      const json = (await res.json()) as ApiSuccess<StatementParseResult>;
      return json.data;
    },
  });
}

export function useCommitStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { accountId: string; transactions: ParsedStatementTransaction[] }) =>
      api.post<ApiSuccess<BankStatementImportResult>>(
        '/banking/statement-import/commit',
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: TXN_KEYS.all }),
  });
}

export interface AnalyzeImportResult {
  accountId: string;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  duplicates: Array<{
    rowIndex: number;
    transactionDate: string;
    type: 'credit' | 'debit';
    amount: number;
    narration: string | null;
    reference: string | null;
  }>;
}

export function useAnalyzeStatement() {
  return useMutation({
    mutationFn: (input: { accountId: string; transactions: ParsedStatementTransaction[] }) =>
      api.post<ApiSuccess<AnalyzeImportResult>>(
        '/banking/statement-import/analyze',
        input,
      ),
  });
}
