import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useCashFlowForecast } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent, Badge } from '@/components/ui';
import { formatINR } from '@/lib/utils';

const DAY_OPTIONS = [30, 60, 90, 180, 365] as const;

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-6 mb-3">
      {title}
    </h3>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const variant = confidence >= 0.8 ? 'success' : confidence >= 0.5 ? 'warning' : 'danger';
  return <Badge variant={variant}>{pct}%</Badge>;
}

function SummaryItem({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${highlight ? 'font-bold' : ''}`}>
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`font-mono tabular-nums ${highlight ? 'text-zinc-900 dark:text-zinc-100' : ''} ${amount < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
        {formatINR(amount)}
      </span>
    </div>
  );
}

export function CashFlowForecastPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useCashFlowForecast(days);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Cash Flow Forecast' }]}
        title="Cash Flow Forecast"
        description="Projected cash balances based on historical cash flow patterns."
      />

      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-zinc-500">
          Forecast period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
      ) : !report ? (
        <EmptyState icon={TrendingUp} title="No data" description="Record transactions to generate a cash flow forecast." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Summary */}
            <div className="space-y-2">
              <SummaryItem label="Current Balance" amount={report.currentBalance} highlight />
              <SummaryItem label="30-Day Projection" amount={report.projectedBalance30d} />
              <SummaryItem label="60-Day Projection" amount={report.projectedBalance60d} />
              <SummaryItem label="90-Day Projection" amount={report.projectedBalance90d} />
            </div>

            {/* Projection Table */}
            <SectionHeader title="Projected Cash Balance" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Date</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Balance</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {report.projections.map((row) => (
                  <tr key={row.date} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{row.date}</td>
                    <td className={`py-2 text-right font-mono tabular-nums ${row.projected < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {formatINR(row.projected)}
                    </td>
                    <td className="py-2 text-right">
                      <ConfidenceBadge confidence={row.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
