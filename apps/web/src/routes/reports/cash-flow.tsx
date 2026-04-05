import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { useCashFlowStatement } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINRAccounting } from '@/lib/utils';

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-5 mb-2">
      {title}
    </h3>
  );
}

function ActivityItems({ items }: { items: { description: string; amount: number }[] }) {
  // Sort: inflows (positive) first, then outflows (negative)
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  if (sorted.length === 0) {
    return <p className="pl-4 text-sm text-zinc-400 italic">No activity</p>;
  }
  return (
    <div className="space-y-1 pl-4">
      {sorted.map((item, idx) => (
        <div key={idx} className="flex justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{item.description}</span>
          <span className={`font-mono tabular-nums ${item.amount < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {formatINRAccounting(item.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionTotal({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
      <span>{label}</span>
      <span className={`font-mono tabular-nums ${amount < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
        {formatINRAccounting(amount)}
      </span>
    </div>
  );
}

function SummaryLine({ label, amount, bold, highlight }: { label: string; amount: number; bold?: boolean; highlight?: boolean }) {
  const colorCls = highlight
    ? (amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
    : 'text-zinc-900 dark:text-zinc-100';
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''} ${colorCls}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatINRAccounting(amount)}</span>
    </div>
  );
}

export function CashFlowPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-04-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useCashFlowStatement(dateFrom, dateTo);
  const report = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Cash Flow' }]}
        title="Cash Flow Statement"
        description="Cash inflows and outflows for the selected period."
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
          onClick={() => window.open(`/api/v1/reports/cash-flow/csv?dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank')}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
      ) : !report ? (
        <EmptyState icon={FileText} title="No data" description="Post transactions to generate the cash flow statement." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Operating Activities */}
            <SectionHeader title="Cash Flow from Operating Activities" />
            <ActivityItems items={report.operating} />
            <SectionTotal label="Net Cash from Operations" amount={report.totalOperating} />

            {/* Investing Activities */}
            <SectionHeader title="Cash Flow from Investing Activities" />
            <ActivityItems items={report.investing} />
            <SectionTotal label="Net Cash from Investing" amount={report.totalInvesting} />

            {/* Financing Activities */}
            <SectionHeader title="Cash Flow from Financing Activities" />
            <ActivityItems items={report.financing} />
            <SectionTotal label="Net Cash from Financing" amount={report.totalFinancing} />

            {/* Net Change */}
            <div className="border-t-2 border-zinc-300 dark:border-zinc-600 pt-3 mt-4">
              <SummaryLine label="Net Increase / (Decrease) in Cash" amount={report.netChange} bold highlight />
            </div>

            {/* Opening / Closing */}
            <div className="mt-6 pt-4 border-t-2 border-zinc-900 dark:border-zinc-100 space-y-2">
              <SummaryLine label="Opening Cash Balance" amount={report.openingBalance} />
              <SummaryLine label="Add: Net Change in Cash" amount={report.netChange} highlight />
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2">
                <SummaryLine label="Closing Cash Balance" amount={report.closingBalance} bold />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
