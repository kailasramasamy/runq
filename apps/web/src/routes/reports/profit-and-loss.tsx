import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useProfitAndLoss } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { PnLLineItem } from '@runq/types';

function useFYDefaults() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    dateFrom: `${startYear}-04-01`,
    dateTo: now.toISOString().split('T')[0]!,
  };
}

function LineItems({ items }: { items: PnLLineItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1 pl-4">
      {items.map((item) => (
        <div key={item.accountCode} className="flex justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{item.accountName}</span>
          <span className="font-mono tabular-nums">{formatINR(item.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionTotal({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  const cls = bold
    ? 'text-base font-bold text-zinc-900 dark:text-zinc-100'
    : 'text-sm font-semibold text-zinc-700 dark:text-zinc-300';
  return (
    <div className={`flex justify-between border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2 ${cls}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatINR(amount)}</span>
    </div>
  );
}

function ProfitLine({ label, amount }: { label: string; amount: number }) {
  const color = amount >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  return (
    <div className={`flex justify-between border-t-2 border-zinc-300 dark:border-zinc-600 pt-3 mt-3 text-base font-bold ${color}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatINR(amount)}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-5 mb-2">
      {title}
    </h3>
  );
}

export function ProfitAndLossPage() {
  const defaults = useFYDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const { data, isLoading } = useProfitAndLoss(dateFrom, dateTo);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Profit & Loss' }]}
        title="Profit & Loss"
        description="Income and expense summary for the selected period."
      />

      <div className="flex items-center gap-4 mb-6">
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
        <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
      ) : !report ? (
        <EmptyState icon={FileText} title="No data" description="Adjust the date range or post transactions to generate the P&L report." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Revenue */}
            <SectionHeader title="Revenue" />
            <LineItems items={report.revenue} />
            <SectionTotal label="Total Revenue" amount={report.totalRevenue} />

            {/* Cost of Goods Sold */}
            {report.cogs.length > 0 && (
              <>
                <SectionHeader title="Cost of Goods Sold" />
                <LineItems items={report.cogs} />
                <SectionTotal label="Total COGS" amount={report.totalCogs} />
              </>
            )}

            {/* Gross Profit */}
            <ProfitLine label="Gross Profit" amount={report.grossProfit} />

            {/* Operating Expenses */}
            {report.operatingExpenses.length > 0 && (
              <>
                <SectionHeader title="Operating Expenses" />
                <LineItems items={report.operatingExpenses} />
                <SectionTotal label="Total Operating Expenses" amount={report.totalOperatingExpenses} />
              </>
            )}

            {/* Operating Profit */}
            <ProfitLine label="Operating Profit (EBITDA)" amount={report.operatingProfit} />

            {/* Depreciation */}
            {report.depreciation.length > 0 && (
              <>
                <SectionHeader title="Depreciation & Amortization" />
                <LineItems items={report.depreciation} />
              </>
            )}

            {/* Financial Costs */}
            {report.financialCosts.length > 0 && (
              <>
                <SectionHeader title="Financial Costs" />
                <LineItems items={report.financialCosts} />
              </>
            )}

            {/* Profit Before Tax */}
            {(report.depreciation.length > 0 || report.financialCosts.length > 0) && (
              <ProfitLine label="Profit Before Tax" amount={report.profitBeforeTax} />
            )}

            {/* Taxes */}
            {report.taxes.length > 0 && (
              <>
                <SectionHeader title="Taxes & Duties" />
                <LineItems items={report.taxes} />
              </>
            )}

            {/* Net Profit */}
            <div className="mt-6 pt-4 border-t-2 border-zinc-900 dark:border-zinc-100">
              <div className={`flex justify-between text-lg font-bold ${report.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                <span>Net Profit</span>
                <span className="font-mono tabular-nums">{formatINR(report.netProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
