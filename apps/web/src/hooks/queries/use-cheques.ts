import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { Cheque, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateChequeInput, DepositChequeInput, BounceChequeInput } from '@runq/validators';

const CHEQUE_KEYS = {
  all: ['cheques'] as const,
  list: (filters?: Record<string, string>) => ['cheques', 'list', filters] as const,
  detail: (id: string) => ['cheques', id] as const,
  upcoming: (days: number) => ['cheques', 'upcoming', days] as const,
};

export function useCheques(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters);
  const qs = params.toString();
  return useQuery({
    queryKey: CHEQUE_KEYS.list(filters),
    queryFn: () => api.get<PaginatedResponse<Cheque>>(`/banking/cheques${qs ? `?${qs}` : ''}`),
  });
}

export function useCheque(id: string) {
  return useQuery({
    queryKey: CHEQUE_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<Cheque>>(`/banking/cheques/${id}`),
    enabled: !!id,
  });
}

export function useUpcomingPDC(days = 30) {
  return useQuery({
    queryKey: CHEQUE_KEYS.upcoming(days),
    queryFn: () => api.get<{ data: Cheque[] }>(`/banking/cheques/upcoming?days=${days}`),
  });
}

export function useCreateCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChequeInput) =>
      api.post<ApiSuccess<Cheque>>('/banking/cheques', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHEQUE_KEYS.all }),
  });
}

export function useDepositCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DepositChequeInput }) =>
      api.post<ApiSuccess<Cheque>>(`/banking/cheques/${id}/deposit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHEQUE_KEYS.all }),
  });
}

export function useClearCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<Cheque>>(`/banking/cheques/${id}/clear`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHEQUE_KEYS.all }),
  });
}

export function useBounceCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BounceChequeInput }) =>
      api.post<ApiSuccess<Cheque>>(`/banking/cheques/${id}/bounce`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHEQUE_KEYS.all }),
  });
}

export function useCancelCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/banking/cheques/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHEQUE_KEYS.all }),
  });
}
