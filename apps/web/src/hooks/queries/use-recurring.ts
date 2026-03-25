import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { RecurringInvoiceTemplate } from '@runq/types';
import type { CreateRecurringInvoiceInput, UpdateRecurringInvoiceInput } from '@runq/validators';

const KEYS = {
  all: ['recurring'] as const,
  list: (status?: string) => ['recurring', 'list', status] as const,
  detail: (id: string) => ['recurring', id] as const,
};

export function useRecurringInvoices(status?: string) {
  return useQuery({
    queryKey: KEYS.list(status),
    queryFn: () => {
      const params = status ? `?status=${status}` : '';
      return api.get<{ data: RecurringInvoiceTemplate[] }>(`/ar/recurring${params}`);
    },
  });
}

export function useRecurringInvoice(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => api.get<{ data: RecurringInvoiceTemplate }>(`/ar/recurring/${id}`),
    enabled: !!id,
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecurringInvoiceInput) =>
      api.post<{ data: RecurringInvoiceTemplate }>('/ar/recurring', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecurringInvoiceInput }) =>
      api.put<{ data: RecurringInvoiceTemplate }>(`/ar/recurring/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function usePauseRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: RecurringInvoiceTemplate }>(`/ar/recurring/${id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useResumeRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: RecurringInvoiceTemplate }>(`/ar/recurring/${id}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/ar/recurring/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useGenerateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: { generated: number; errors: string[] } }>('/ar/recurring/generate'),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
