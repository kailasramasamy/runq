import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useComparisonReport } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';

type ComparisonType = 'mom' | 'yoy';

// Rows where increase = bad (expenses, costs)
const COST_ROWS = new Set(['COGS', 'Operating Expenses']);
// Rows that are subtotals / profit lines
const PROFIT_ROWS = new Set(['Gross Profit', 'Operating Profit', 'Net Profit']);

function formatChange(change: number, isCostRow: boolean): { text: string; color: string } {
  const text = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (Math.abs(change) < 0.1) return { text, color: 'text-zinc-400' };
  // For cost rows, increase is bad (red), decrease is good (green)
  // For revenue/profit rows, increase is good (green), decrease is bad (red)
  const isGood = isCostRow ? change < 0 : change > 0;
  return { text, color: isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' };
}

export function ComparisonPage() {
  const [type, setType] = useState<ComparisonType>('mom');
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-04-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useComparisonReport(type, dateFrom, dateTo);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Comparison' }]}
        title="Comparison Report"
        description="Compare financial metrics across periods."
      />

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="text-sm text-zinc-500">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ComparisonType)}
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
          >
            <option value="mom">Month over Month</option>
            <option value="yoy">Year over Year</option>
          </select>
        </label>
        <label className="text-sm text-zinc-500">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
          />
        </label>
        <label className="text-sm text-zinc-500">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
          />
        </label>
      </div>

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={6} /></tbody></table>
      ) : !report || report.periods.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data" description="Adjust the date range to compare periods." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">Metric</th>
                  {report.periods.map((period) => (
                    <th key={period} className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 min-w-[120px]">
                      {period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => {
                  const isProfit = PROFIT_ROWS.has(row.label);
                  const isCost = COST_ROWS.has(row.label);

                  return (
                    <tr
                      key={row.label}
                      className={
                        isProfit
                          ? 'border-t-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50'
                          : 'border-t border-zinc-100 dark:border-zinc-800'
                      }
                    >
                      <td className={`py-2.5 pr-4 ${isProfit ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {row.label}
                      </td>
                      {row.values.map((value, idx) => {
                        const prev = idx > 0 ? row.values[idx - 1] : undefined;
                        const change = prev && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null;
                        const changeInfo = change !== null ? formatChange(change, isCost) : null;
                        const valueColor = isProfit
                          ? (value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
                          : '';

                        return (
                          <td key={idx} className="text-right py-2.5 px-3">
                            <div className={`font-mono tabular-nums ${isProfit ? 'font-bold' : ''} ${valueColor}`}>
                              {formatINR(value)}
                            </div>
                            {changeInfo && (
                              <div className={`text-xs font-mono tabular-nums ${changeInfo.color}`}>
                                {changeInfo.text}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
