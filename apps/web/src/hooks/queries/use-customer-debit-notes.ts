import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { CustomerDebitNote, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateCustomerDebitNoteInput, UpdateCustomerDebitNoteInput, CustomerDebitNoteFilter } from '@runq/validators';

const KEYS = {
  all: ['customer-debit-notes'] as const,
  list: (filters?: Record<string, unknown>) => ['customer-debit-notes', 'list', filters] as const,
  detail: (id: string) => ['customer-debit-notes', 'detail', id] as const,
};

export function useCustomerDebitNotes(filters?: CustomerDebitNoteFilter, page = 1, limit = 20) {
  const key = { ...filters, page, limit };
  return useQuery({
    queryKey: KEYS.list(key as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.customerId) params.set('customerId', filters.customerId);
      if (filters?.status) params.set('status', filters.status);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api.get<PaginatedResponse<CustomerDebitNote>>(`/ar/customer-debit-notes?${params.toString()}`);
    },
  });
}

export function useCustomerDebitNote(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<CustomerDebitNote>>(`/ar/customer-debit-notes/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomerDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomerDebitNoteInput) =>
      api.post<ApiSuccess<CustomerDebitNote>>('/ar/customer-debit-notes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateCustomerDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerDebitNoteInput }) =>
      api.put<ApiSuccess<CustomerDebitNote>>(`/ar/customer-debit-notes/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useIssueCustomerDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<CustomerDebitNote>>(`/ar/customer-debit-notes/${id}/issue`, {}),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useApplyCustomerDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<CustomerDebitNote>>(`/ar/customer-debit-notes/${id}/apply`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useDeleteCustomerDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/customer-debit-notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
