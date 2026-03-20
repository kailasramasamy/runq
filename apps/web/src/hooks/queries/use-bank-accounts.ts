import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { BankAccount } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateBankAccountInput, UpdateBankAccountInput } from '@runq/validators';

const BANK_ACCOUNT_KEYS = {
  all: ['bank-accounts'] as const,
  list: (filters?: Record<string, unknown>) => ['bank-accounts', 'list', filters] as const,
  detail: (id: string) => ['bank-accounts', 'detail', id] as const,
  balance: (id: string) => ['bank-accounts', 'balance', id] as const,
};

export function useBankAccounts() {
  return useQuery({
    queryKey: BANK_ACCOUNT_KEYS.list(),
    queryFn: () => api.get<PaginatedResponse<BankAccount>>('/banking/accounts'),
  });
}

export function useBankAccount(id: string) {
  return useQuery({
    queryKey: BANK_ACCOUNT_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<BankAccount>>(`/banking/accounts/${id}`),
    enabled: !!id,
  });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankAccountInput) =>
      api.post<ApiSuccess<BankAccount>>('/banking/accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BANK_ACCOUNT_KEYS.all }),
  });
}

export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBankAccountInput }) =>
      api.put<ApiSuccess<BankAccount>>(`/banking/accounts/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: BANK_ACCOUNT_KEYS.all });
      qc.invalidateQueries({ queryKey: BANK_ACCOUNT_KEYS.detail(id) });
    },
  });
}

export function useBankBalance(id: string) {
  return useQuery({
    queryKey: BANK_ACCOUNT_KEYS.balance(id),
    queryFn: () => api.get<ApiSuccess<{ balance: number }>>(`/banking/accounts/${id}/balance`),
    enabled: !!id,
  });
}
