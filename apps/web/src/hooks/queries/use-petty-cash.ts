import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PettyCashAccount, PettyCashTransaction } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreatePettyCashAccountInput,
  PettyCashTransactionInput,
  ApprovePettyCashInput,
} from '@runq/validators';

const PC_KEYS = {
  all: ['petty-cash'] as const,
  accounts: ['petty-cash', 'accounts'] as const,
  account: (id: string) => ['petty-cash', 'accounts', id] as const,
  transactions: (accountId: string) => ['petty-cash', 'transactions', accountId] as const,
};

export function usePettyCashAccounts() {
  return useQuery({
    queryKey: PC_KEYS.accounts,
    queryFn: () => api.get<PaginatedResponse<PettyCashAccount>>('/banking/petty-cash'),
  });
}

export function usePettyCashAccount(id: string) {
  return useQuery({
    queryKey: PC_KEYS.account(id),
    queryFn: () => api.get<ApiSuccess<PettyCashAccount>>(`/banking/petty-cash/${id}`),
    enabled: !!id,
  });
}

export function useCreatePettyCashAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePettyCashAccountInput) =>
      api.post<ApiSuccess<PettyCashAccount>>('/banking/petty-cash', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PC_KEYS.all }),
  });
}

export function usePettyCashTransactions(accountId: string) {
  return useQuery({
    queryKey: PC_KEYS.transactions(accountId),
    queryFn: () =>
      api.get<PaginatedResponse<PettyCashTransaction>>(
        `/banking/petty-cash/${accountId}/transactions`,
      ),
    enabled: !!accountId,
  });
}

export function useCreatePettyCashTransaction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PettyCashTransactionInput) =>
      api.post<ApiSuccess<PettyCashTransaction>>(
        `/banking/petty-cash/${accountId}/transactions`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PC_KEYS.all });
      qc.invalidateQueries({ queryKey: PC_KEYS.transactions(accountId) });
    },
  });
}

export function useApprovePettyCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      transactionId,
      data,
    }: {
      accountId: string;
      transactionId: string;
      data: ApprovePettyCashInput;
    }) =>
      api.post<ApiSuccess<PettyCashTransaction>>(
        `/banking/petty-cash/${accountId}/transactions/${transactionId}/approve`,
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: PC_KEYS.all }),
  });
}
