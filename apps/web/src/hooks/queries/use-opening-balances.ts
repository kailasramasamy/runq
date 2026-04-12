import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

interface OBEntry {
  id: string;
  name: string;
  amount: number;
  hasOpeningBalance: boolean;
}

interface OpeningBalanceStatus {
  customers: OBEntry[];
  vendors: OBEntry[];
}

interface SaveInput {
  effectiveDate: string;
  customers: { id: string; amount: number }[];
  vendors: { id: string; amount: number }[];
}

export function useOpeningBalances() {
  return useQuery({
    queryKey: ['opening-balances'],
    queryFn: () => api.get<{ data: OpeningBalanceStatus }>('/settings/opening-balances'),
  });
}

export function useSaveOpeningBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveInput) => api.post<{ data: { invoicesCreated: number; billsCreated: number } }>('/settings/opening-balances', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opening-balances'] }),
  });
}

export function useSaveCustomerOB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amount: number; effectiveDate: string }) =>
      api.post<{ data: { created: boolean } }>('/settings/opening-balances/customer', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opening-balances'] }),
  });
}

export function useSaveVendorOB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amount: number; effectiveDate: string }) =>
      api.post<{ data: { created: boolean } }>('/settings/opening-balances/vendor', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opening-balances'] }),
  });
}

export type { OBEntry, OpeningBalanceStatus };
