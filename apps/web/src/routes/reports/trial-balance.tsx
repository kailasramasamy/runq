import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText, ArrowRight } from 'lucide-react';
import { useTrialBalance, type TrialBalanceAccount } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';

const TYPE_LABEL: Record<TrialBalanceAccount['type'], string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const TYPE_ORDER: TrialBalanceAccount['type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function TrialBalancePage() {
  const navigate = useNavigate();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useTrialBalance(asOfDate);
  const tb = data?.data;

  const grouped = useMemo(() => {
    if (!tb) return [];
    const byType = new Map<TrialBalanceAccount['type'], TrialBalanceAccount[]>();
    for (const a of tb.accounts) {
      if (!byType.has(a.type)) byType.set(a.type, []);
      byType.get(a.type)!.push(a);
    }
    return TYPE_ORDER
      .map((t) => ({
        type: t,
        label: TYPE_LABEL[t],
        accounts: (byType.get(t) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .filter((g) => g.accounts.length > 0);
  }, [tb]);

  const balanced = tb ? Math.abs(tb.totalDebit - tb.totalCredit) < 0.01 : false;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Trial Balance' }]}
        title="Trial Balance"
        description="All ledger account balances as of the selected date."
      />

      <div className="mb-6 flex items-center gap-4">
        <label className="text-sm text-zinc-500">
          As of
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="ml-2 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:[color-scheme:dark]"
          />
        </label>
        {tb && (
          <span className={`text-sm ${balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {balanced ? 'Balanced' : `Imbalanced by ${formatINR(Math.abs(tb.totalDebit - tb.totalCredit))} — investigate`}
          </span>
        )}
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={10} cols={4} />
          ) : !tb || tb.accounts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No ledger entries"
              description={`No posted journal lines on or before ${asOfDate}.`}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => {
                const groupDebit = g.accounts.reduce((s, a) => s + a.debit, 0);
                const groupCredit = g.accounts.reduce((s, a) => s + a.credit, 0);
                return (
                  <div key={g.type}>
                    <h3 className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {g.label}
                    </h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                          <th className="py-1.5 pr-2 font-medium">Code</th>
                          <th className="py-1.5 pr-2 font-medium">Account</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Debit</th>
                          <th className="py-1.5 text-right font-medium">Credit</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {g.accounts.map((a) => (
                          <tr
                            key={a.code}
                            className="cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                            onClick={() => navigate({ to: '/finance/gl', search: { accountCode: a.code, asOfDate } as never })}
                            title={`Drill into ${a.code} ${a.name}`}
                          >
                            <td className="py-1.5 pr-2 font-mono text-[12.5px] text-zinc-500 dark:text-zinc-400">{a.code}</td>
                            <td className="py-1.5 pr-2 text-zinc-900 dark:text-zinc-100">{a.name}</td>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                              {a.debit > 0 ? formatINR(a.debit) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums">
                              {a.credit > 0 ? formatINR(a.credit) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                            </td>
                            <td className="text-zinc-300 dark:text-zinc-600"><ArrowRight size={12} /></td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-zinc-300 dark:border-zinc-600">
                          <td colSpan={2} className="py-2 text-[12.5px] font-semibold text-zinc-700 dark:text-zinc-300">
                            Subtotal — {g.label}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatINR(groupDebit)}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatINR(groupCredit)}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}

              <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <div className="grid grid-cols-3 items-baseline gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  <span>Total</span>
                  <span className="text-right font-mono tabular-nums">{formatINR(tb.totalDebit)}</span>
                  <span className="text-right font-mono tabular-nums">{formatINR(tb.totalCredit)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
