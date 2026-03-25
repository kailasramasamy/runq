import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { HsnSacCode } from '@runq/types';

const HSN_SAC_KEYS = {
  search: (q: string, type?: string) => ['hsn-sac', 'search', q, type] as const,
  byCode: (code: string) => ['hsn-sac', code] as const,
};

export function useHsnSacSearch(q: string, type?: 'hsn' | 'sac') {
  return useQuery({
    queryKey: HSN_SAC_KEYS.search(q, type),
    queryFn: () => {
      const params = new URLSearchParams({ q });
      if (type) params.set('type', type);
      return api.get<{ data: HsnSacCode[] }>(`/masters/hsn-sac?${params}`);
    },
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 min — reference data rarely changes
  });
}

export function useHsnSacByCode(code: string) {
  return useQuery({
    queryKey: HSN_SAC_KEYS.byCode(code),
    queryFn: () => api.get<{ data: HsnSacCode }>(`/masters/hsn-sac/${code}`),
    enabled: !!code,
    staleTime: 10 * 60 * 1000,
  });
}
