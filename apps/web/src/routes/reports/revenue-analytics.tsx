import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useRevenueAnalytics } from '@/hooks/queries/use-reports';
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

function ByCustomer({ items }: { items: { customerId: string; customerName: string; amount: number; percentage: number }[] }) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const maxAmount = Math.max(...sorted.map((i) => i.amount), 1);

  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <div key={item.customerId}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-600 dark:text-zinc-400">{item.customerName}</span>
            <span className="font-mono tabular-nums">
              {formatINR(item.amount)}
              <span className="text-zinc-400 ml-2 text-xs">{item.percentage.toFixed(1)}%</span>
            </span>
          </div>
          <HorizontalBar percentage={(item.amount / maxAmount) * 100} color="bg-emerald-500" />
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
          <HorizontalBar percentage={(item.amount / maxAmount) * 100} color="bg-green-500" />
        </div>
      ))}
    </div>
  );
}

export function RevenueAnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-04-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useRevenueAnalytics(dateFrom, dateTo);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Revenue Analytics' }]}
        title="Revenue Analytics"
        description="Revenue breakdown by customer and month."
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
        <EmptyState icon={TrendingUp} title="No data" description="Record revenue to see analytics." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Total */}
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sm text-zinc-500">Total Revenue</span>
              <span className="text-2xl font-bold font-mono tabular-nums text-green-600 dark:text-green-400">{formatINR(report.total)}</span>
            </div>

            {/* By Customer */}
            <SectionHeader title="By Customer" />
            <ByCustomer items={report.byCustomer} />

            {/* By Month */}
            <SectionHeader title="Monthly Trend" />
            <ByMonth items={report.byMonth} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
