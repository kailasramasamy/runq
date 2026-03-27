import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';

interface BankBalance {
  id: string;
  name: string;
  bankName: string;
  accountType: string;
  currentBalance: string;
}

interface BankBalancesResponse {
  accounts: BankBalance[];
  total: string;
}

function useBankBalances() {
  return useQuery({
    queryKey: ['dashboard', 'bank-balances'],
    queryFn: () => api.get<{ data: BankBalancesResponse }>('/dashboard/bank-balances'),
    staleTime: 60_000,
  });
}

function AccountTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    current: 'Current',
    savings: 'Savings',
    overdraft: 'Overdraft',
    cash_credit: 'Cash Credit',
  };
  return <span>{labels[type] ?? type}</span>;
}

export function CashPositionWidget() {
  const { data, isLoading } = useBankBalances();
  const balances = data?.data;

  return (
    <Card>
      <CardHeader
        title="Cash Position"
        action={
          balances ? (
            <span className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {formatINR(parseFloat(balances.total) || 0)}
            </span>
          ) : undefined
        }
      />
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : !balances?.accounts.length ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Landmark size={24} className="text-zinc-400" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No bank accounts configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="pb-2 text-left text-xs font-medium text-zinc-500">Account</th>
                  <th className="pb-2 text-left text-xs font-medium text-zinc-500">Bank</th>
                  <th className="pb-2 text-left text-xs font-medium text-zinc-500">Type</th>
                  <th className="pb-2 text-right text-xs font-medium text-zinc-500">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {balances.accounts.map((acct) => (
                  <tr key={acct.id}>
                    <td className="py-2 text-zinc-900 dark:text-zinc-100">{acct.name}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{acct.bankName}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">
                      <AccountTypeLabel type={acct.accountType} />
                    </td>
                    <td className="py-2 text-right font-mono text-zinc-900 dark:text-zinc-100">
                      {formatINR(parseFloat(acct.currentBalance) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-300 dark:border-zinc-700">
                  <td colSpan={3} className="py-2 text-xs font-medium text-zinc-500">Total</td>
                  <td className="py-2 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatINR(parseFloat(balances.total) || 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
