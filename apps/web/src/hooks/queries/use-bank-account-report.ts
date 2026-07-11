import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess, BankAccountReport } from '@runq/types';

/** Per-bank-account income/spend report for a date range. */
export function useBankAccountReport(accountId: string, dateFrom: string, dateTo: string) {
  const qs = new URLSearchParams({ dateFrom, dateTo }).toString();
  return useQuery({
    queryKey: ['bank-account-report', accountId, dateFrom, dateTo],
    queryFn: () =>
      api.get<ApiSuccess<BankAccountReport>>(`/banking/accounts/${accountId}/report?${qs}`),
    enabled: !!accountId,
  });
}
