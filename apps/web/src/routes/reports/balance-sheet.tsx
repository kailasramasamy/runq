import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { useBalanceSheet } from '@/hooks/queries/use-reports';
import { PageHeader, TableSkeleton, EmptyState, Card, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';

interface LineItem {
  accountCode: string;
  accountName: string;
  amount: number;
}

function groupByPrefix(items: LineItem[], prefixes: { prefix: string; label: string }[]) {
  return prefixes.map(({ prefix, label }) => {
    const children = items.filter((i) => i.accountCode.startsWith(prefix));
    const total = children.reduce((s, c) => s + c.amount, 0);
    return { label, children, total };
  }).filter((g) => g.children.length > 0);
}

function LineItems({ items }: { items: LineItem[] }) {
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

function SubSection({ label, total, children }: { label: string; total: number; children: LineItem[] }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        <span>{label}</span>
      </div>
      <LineItems items={children} />
      <div className="flex justify-between text-sm font-semibold border-t border-zinc-200 dark:border-zinc-700 pt-1 mt-1 pl-4">
        <span>Total {label}</span>
        <span className="font-mono tabular-nums">{formatINR(total)}</span>
      </div>
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

function SectionTotal({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between border-t-2 border-zinc-300 dark:border-zinc-600 pt-3 mt-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatINR(amount)}</span>
    </div>
  );
}

const ASSET_GROUPS = [
  { prefix: '11', label: 'Current Assets' },
  { prefix: '12', label: 'Fixed Assets' },
  { prefix: '13', label: 'Intangible Assets' },
];

const LIABILITY_GROUPS = [
  { prefix: '21', label: 'Current Liabilities' },
  { prefix: '22', label: 'Long-Term Liabilities' },
];

export function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading } = useBalanceSheet(asOfDate);
  const report = data?.data;

  const balanced = report
    ? Math.abs(report.totalAssets - (report.totalLiabilities + report.totalEquity)) < 0.01
    : false;

  const assetGroups = report ? groupByPrefix(report.assets, ASSET_GROUPS) : [];
  const liabilityGroups = report ? groupByPrefix(report.liabilities, LIABILITY_GROUPS) : [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Balance Sheet' }]}
        title="Balance Sheet"
        description="Financial position as of the selected date."
      />

      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-zinc-500">
          As of
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm dark:[color-scheme:dark]"
          />
        </label>
        <button
          onClick={() => window.open(`/api/v1/reports/balance-sheet/csv?asOfDate=${asOfDate}`, '_blank')}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={12} /></tbody></table>
      ) : !report ? (
        <EmptyState icon={FileText} title="No data" description="Post transactions to generate the balance sheet." />
      ) : (
        <Card>
          <CardContent className="py-6 max-w-2xl">
            {/* Assets */}
            <SectionHeader title="Assets" />
            {assetGroups.map((g) => (
              <SubSection key={g.label} label={g.label} total={g.total} children={g.children} />
            ))}
            <SectionTotal label="Total Assets" amount={report.totalAssets} />

            {/* Liabilities */}
            <SectionHeader title="Liabilities" />
            {liabilityGroups.map((g) => (
              <SubSection key={g.label} label={g.label} total={g.total} children={g.children} />
            ))}
            <SectionTotal label="Total Liabilities" amount={report.totalLiabilities} />

            {/* Equity */}
            <SectionHeader title="Equity" />
            {report.equity.length > 0 ? (
              <LineItems items={report.equity} />
            ) : (
              <div className="pl-4 text-sm text-zinc-400">
                Retained Earnings: <span className="font-mono tabular-nums">{formatINR(report.totalAssets - report.totalLiabilities)}</span>
                <span className="text-xs ml-2">(computed)</span>
              </div>
            )}
            <SectionTotal label="Total Equity" amount={report.totalEquity > 0 ? report.totalEquity : report.totalAssets - report.totalLiabilities} />

            {/* Accounting Equation */}
            <div className="mt-6 pt-4 border-t-2 border-zinc-900 dark:border-zinc-100">
              <div className={`flex justify-between text-sm font-semibold ${balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                <span>Assets = Liabilities + Equity</span>
                <span className="font-mono tabular-nums">
                  {formatINR(report.totalAssets)} = {formatINR(report.totalLiabilities)} + {formatINR(report.totalAssets - report.totalLiabilities)}
                </span>
              </div>
              <div className={`text-xs mt-1 text-right ${balanced ? 'text-green-500' : 'text-red-500'}`}>
                {balanced ? 'Balanced' : 'Unbalanced — check journal entries'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
