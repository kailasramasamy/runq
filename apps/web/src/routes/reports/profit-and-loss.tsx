import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { useProfitAndLoss, useMonthlyPnl } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { MonthlyPnlTable } from '@/components/reports/monthly-pnl-table';
import { formatINR } from '@/lib/utils';
import type { PnLLineItem, ProfitAndLoss } from '@runq/types';

type View = 'monthly' | 'statement';

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

function StatementCard({ report }: { report: ProfitAndLoss }) {
  return (
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
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: { key: View; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'statement', label: 'Statement' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={view === o.key}
          className={`rounded-md px-3 py-1 text-sm font-medium ${view === o.key
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm text-zinc-500">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
      />
    </label>
  );
}

function ReportBody({ view, dateFrom, dateTo }: { view: View; dateFrom: string; dateTo: string }) {
  const statement = useProfitAndLoss(view === 'statement' ? dateFrom : '', dateTo);
  const monthly = useMonthlyPnl(view === 'monthly' ? dateFrom : '', dateTo);
  const isLoading = view === 'monthly' ? monthly.isLoading : statement.isLoading;
  const empty = view === 'monthly' ? !monthly.data?.data : !statement.data?.data;

  if (isLoading) return <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>;
  if (empty) {
    return <EmptyState icon={FileText} title="No data" description="Adjust the date range or post transactions to generate the P&L report." />;
  }
  if (view === 'statement') return <StatementCard report={statement.data!.data} />;
  return (
    <Card>
      <CardContent className="py-4">
        <MonthlyPnlTable report={monthly.data!.data} />
      </CardContent>
    </Card>
  );
}

export function ProfitAndLossPage() {
  const defaults = useFYDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [view, setView] = useState<View>('monthly');

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Profit & Loss' }]}
        title="Profit & Loss"
        description="How the business did each month — sales against milk, materials and running costs."
      />

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <ViewToggle view={view} onChange={setView} />
        <DateField label="From" value={dateFrom} onChange={setDateFrom} />
        <DateField label="To" value={dateTo} onChange={setDateTo} />
        {view === 'statement' && (
          <button
            onClick={() => window.open(`/api/v1/reports/profit-and-loss/csv?dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank')}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      <ReportBody view={view} dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}
