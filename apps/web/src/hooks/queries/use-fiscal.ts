import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { FiscalPeriod, ApiSuccess } from '@runq/types';

const FISCAL_KEYS = {
  periods: ['gl', 'fiscal-periods'] as const,
};

export function useFiscalPeriods() {
  return useQuery({
    queryKey: FISCAL_KEYS.periods,
    queryFn: () => api.get<ApiSuccess<FiscalPeriod[]>>('/gl/fiscal-periods'),
  });
}

export function useCreateFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; startDate: string; endDate: string }) =>
      api.post<ApiSuccess<FiscalPeriod>>('/gl/fiscal-periods', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_KEYS.periods }),
  });
}

export function useCloseFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status: 'closed' | 'locked' }) =>
      api.put<ApiSuccess<FiscalPeriod>>(`/gl/fiscal-periods/${data.id}/close`, { status: data.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_KEYS.periods }),
  });
}
