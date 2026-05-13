import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

interface ClaimRow {
  id: string;
  status: 'pending' | 'verified' | 'rejected' | 'cancelled';
}

export function usePendingPaymentClaimsCount() {
  return useQuery({
    queryKey: ['payment-claims', 'pending-count'],
    queryFn: async () => {
      const res = await api.get<{ data: ClaimRow[] }>('/ar/payment-claims?status=pending');
      return res.data.length;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
