import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { CreditNote, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateCreditNoteInput, UpdateCreditNoteInput, CreditNoteFilter } from '@runq/validators';

const CN_KEYS = {
  all: ['credit-notes'] as const,
  list: (filters?: Record<string, unknown>) => ['credit-notes', 'list', filters] as const,
  detail: (id: string) => ['credit-notes', 'detail', id] as const,
};

function buildFilterQs(filters?: CreditNoteFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.customerId) params.set('customerId', filters.customerId);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useCreditNotes(filters?: CreditNoteFilter) {
  return useQuery({
    queryKey: CN_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<CreditNote>>(`/ar/credit-notes${buildFilterQs(filters)}`),
  });
}

export function useCreditNote(id: string) {
  return useQuery({
    queryKey: CN_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<CreditNote>>(`/ar/credit-notes/${id}`),
    enabled: !!id,
  });
}

export function useCreateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCreditNoteInput) =>
      api.post<ApiSuccess<CreditNote>>('/ar/credit-notes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CN_KEYS.all }),
  });
}

export function useUpdateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCreditNoteInput }) =>
      api.put<ApiSuccess<CreditNote>>(`/ar/credit-notes/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: CN_KEYS.all });
      qc.invalidateQueries({ queryKey: CN_KEYS.detail(id) });
    },
  });
}

export function useIssueCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<CreditNote>>(`/ar/credit-notes/${id}/issue`, {}),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: CN_KEYS.all });
      qc.invalidateQueries({ queryKey: CN_KEYS.detail(id) });
    },
  });
}

export function useDeleteCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/credit-notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CN_KEYS.all }),
  });
}
