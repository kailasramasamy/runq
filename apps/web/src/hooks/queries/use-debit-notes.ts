import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { DebitNote } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateDebitNoteInput, UpdateDebitNoteInput } from '@runq/validators';

const DN_KEYS = {
  all: ['debit-notes'] as const,
  list: (filters?: Record<string, unknown>) => ['debit-notes', 'list', filters] as const,
  detail: (id: string) => ['debit-notes', 'detail', id] as const,
};

interface DebitNoteFilters {
  vendorId?: string;
  status?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useDebitNotes(filters?: DebitNoteFilters) {
  const params = new URLSearchParams();
  if (filters?.vendorId) params.set('vendorId', filters.vendorId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: DN_KEYS.list(filters),
    queryFn: () => api.get<PaginatedResponse<DebitNote>>(`/ap/debit-notes${qs ? `?${qs}` : ''}`),
  });
}

export function useDebitNote(id: string) {
  return useQuery({
    queryKey: DN_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<DebitNote>>(`/ap/debit-notes/${id}`),
    enabled: !!id,
  });
}

export function useCreateDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDebitNoteInput) =>
      api.post<ApiSuccess<DebitNote>>('/ap/debit-notes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DN_KEYS.all }),
  });
}

export function useUpdateDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDebitNoteInput }) =>
      api.put<ApiSuccess<DebitNote>>(`/ap/debit-notes/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: DN_KEYS.all });
      qc.invalidateQueries({ queryKey: DN_KEYS.detail(id) });
    },
  });
}

export function useIssueDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<DebitNote>>(`/ap/debit-notes/${id}/issue`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: DN_KEYS.all });
      qc.invalidateQueries({ queryKey: DN_KEYS.detail(id) });
    },
  });
}

export function useApplyDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<DebitNote>>(`/ap/debit-notes/${id}/apply`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: DN_KEYS.all });
      qc.invalidateQueries({ queryKey: DN_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}

export function useDeleteDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ap/debit-notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DN_KEYS.all }),
  });
}
