import { useState } from 'react';
import { PieChart, Download } from 'lucide-react';
import { useExpenseAnalytics } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-6 mb-3">
      {title}
    </h3>
  );
}

function HorizontalBar({ percentage, color }: { percentage: number; color: string }) {
  return (
    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden">
      <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  );
}

function ByCategory({ items }: { items: { category: string; amount: number; percentage: number }[] }) {
  const maxAmount = Math.max(...items.map((i) => i.amount), 1);
  const sorted = [...items].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <div key={item.category}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-600 dark:text-zinc-400">{item.category}</span>
            <span className="font-mono tabular-nums">
              {formatINR(item.amount)}
              <span className="text-zinc-400 ml-2 text-xs">{item.percentage.toFixed(1)}%</span>
            </span>
          </div>
          <HorizontalBar percentage={(item.amount / maxAmount) * 100} color="bg-blue-500" />
        </div>
      ))}
    </div>
  );
}

function ByVendor({ items }: { items: { vendorId: string; vendorName: string; amount: number; percentage: number }[] }) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-1.5">
      {sorted.map((item) => (
        <div key={item.vendorId} className="flex justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{item.vendorName}</span>
          <span className="font-mono tabular-nums">
            {formatINR(item.amount)}
            <span className="text-zinc-400 ml-2 text-xs">{item.percentage.toFixed(1)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ByMonth({ items }: { items: { month: string; amount: number }[] }) {
  const maxAmount = Math.max(...items.map((i) => i.amount), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.month}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-600 dark:text-zinc-400">{item.month}</span>
            <span className="font-mono tabular-nums">{formatINR(item.amount)}</span>
          </div>
          <HorizontalBar percentage={(item.amount / maxAmount) * 100} color="bg-orange-500" />
        </div>
      ))}
    </div>
  );
}

export function ExpenseAnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-04-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useExpenseAnalytics(dateFrom, dateTo);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Expense Analytics' }]}
        title="Expense Analytics"
        description="Expense breakdown by category, vendor, and month."
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
        <button
          onClick={() => window.open(`/api/v1/reports/expense-analytics/csv?dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank')}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
      ) : !report ? (
        <EmptyState icon={PieChart} title="No data" description="Record expenses to see analytics." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Total */}
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sm text-zinc-500">Total Expenses</span>
              <span className="text-2xl font-bold font-mono tabular-nums">{formatINR(report.total)}</span>
            </div>

            {/* By Category */}
            <SectionHeader title="By Category" />
            <ByCategory items={report.byCategory} />

            {/* By Vendor */}
            <SectionHeader title="By Vendor" />
            <ByVendor items={report.byVendor} />

            {/* By Month */}
            <SectionHeader title="Monthly Trend" />
            <ByMonth items={report.byMonth} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
