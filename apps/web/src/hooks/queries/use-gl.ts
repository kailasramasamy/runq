import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { Account, JournalEntry, JournalEntryWithLines, TrialBalanceRow, ApiSuccess } from '@runq/types';
import type { CreateAccountInput, UpdateAccountInput, CreateJournalEntryInput, JournalEntryFilter } from '@runq/validators';

export interface PaginatedJournalEntries {
  data: JournalEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const GL_KEYS = {
  accounts: ['gl', 'accounts'] as const,
  journalEntries: (filters?: Record<string, unknown>) => ['gl', 'journal-entries', filters] as const,
  journalEntry: (id: string) => ['gl', 'journal-entries', id] as const,
  trialBalance: (asOfDate?: string) => ['gl', 'trial-balance', asOfDate] as const,
};

function buildJeQs(filters?: JournalEntryFilter, page?: number, limit?: number): string {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.sourceType) params.set('sourceType', filters.sourceType);
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useGLAccounts() {
  return useQuery({
    queryKey: GL_KEYS.accounts,
    queryFn: () => api.get<ApiSuccess<Account[]>>('/gl/accounts'),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAccountInput) => api.post<ApiSuccess<Account>>('/gl/accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: GL_KEYS.accounts }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountInput }) =>
      api.put<ApiSuccess<Account>>(`/gl/accounts/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: GL_KEYS.accounts }),
  });
}

export function useJournalEntries(filters?: JournalEntryFilter, page = 1, limit = 20) {
  return useQuery({
    queryKey: GL_KEYS.journalEntries({ ...filters, page, limit } as Record<string, unknown>),
    queryFn: () => api.get<PaginatedJournalEntries>(`/gl/journal-entries${buildJeQs(filters, page, limit)}`),
  });
}

export function useJournalEntry(id: string) {
  return useQuery({
    queryKey: GL_KEYS.journalEntry(id),
    queryFn: () => api.get<ApiSuccess<JournalEntryWithLines>>(`/gl/journal-entries/${id}`),
    enabled: !!id,
  });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateJournalEntryInput) => api.post<ApiSuccess<JournalEntry>>('/gl/journal-entries', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gl', 'journal-entries'] }),
  });
}

export function useTrialBalance(asOfDate?: string) {
  const qs = asOfDate ? `?asOfDate=${asOfDate}` : '';
  return useQuery({
    queryKey: GL_KEYS.trialBalance(asOfDate),
    queryFn: () => api.get<ApiSuccess<TrialBalanceRow[]>>(`/gl/trial-balance${qs}`),
  });
}
