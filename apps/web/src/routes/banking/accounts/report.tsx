import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpDown } from 'lucide-react';
import { useBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useBankAccountReport } from '@/hooks/queries/use-bank-account-report';
import { formatINRShort } from '@/lib/utils';
import { PageHeader, Button, StatTile, DetailCard, Tabs } from '@/components/ar/primitives';
import { InVsOutChart, CategoryDonut, CATEGORY_COLORS } from '@/components/banking/report-charts';
import type { ReportCategoryAmount } from '@runq/types';

type Period = 'thisMonth' | 'lastMonth' | 'last6' | 'fy';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last6', label: 'Last 6 months' },
  { id: 'fy', label: 'This FY' },
];

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

function rangeFor(p: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  switch (p) {
    case 'thisMonth':
      return { from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)) };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: ymd(py, pm, 1), to: ymd(py, pm, daysIn(py, pm)) };
    }
    case 'last6': {
      const s = new Date(y, m - 1 - 5, 1);
      return { from: ymd(s.getFullYear(), s.getMonth() + 1, 1), to: ymd(y, m, daysIn(y, m)) };
    }
    case 'fy': {
      const fy = m >= 4 ? y : y - 1;
      return { from: ymd(fy, 4, 1), to: ymd(fy + 1, 3, 31) };
    }
  }
}

function toSlices(cats: ReportCategoryAmount[]) {
  const top = cats.slice(0, 6).map((c) => ({ name: c.name, value: c.amount }));
  const rest = cats.slice(6);
  if (rest.length) top.push({ name: 'Other', value: rest.reduce((s, c) => s + c.amount, 0) });
  return top;
}

interface Props {
  accountId: string;
}

export function BankAccountReportPage({ accountId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('last6');
  const [tab, setTab] = useState<'spend' | 'income'>('spend');
  const { from, to } = rangeFor(period);
  const { data: acctData } = useBankAccount(accountId);
  const { data, isLoading } = useBankAccountReport(accountId, from, to);
  const report = data?.data;
  const account = acctData?.data;

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/banking/accounts' });
  }

  const cats = report ? (tab === 'spend' ? report.spendByCategory : report.incomeByCategory) : [];

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[
          { label: 'Banking', href: '/banking/accounts' },
          { label: 'Accounts', href: '/banking/accounts' },
          { label: account?.name ?? 'Report' },
        ]}
        title={account ? `${account.name} — Report` : 'Account report'}
        description="How money moves in and out of this account, broken down by category."
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowUpDown size={13} />}
              onClick={() => navigate({ to: '/finance/banking/transactions', search: { accountId } as never })}
            >
              Transactions
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors"
            style={
              period === p.id
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading || !report ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }} />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Money in" value={formatINRShort(report.summary.moneyIn)} sub="Received" tone="pos" />
            <StatTile label="Money out" value={formatINRShort(report.summary.moneyOut)} sub="Spent" tone="neg" />
            <StatTile
              label="Net"
              value={formatINRShort(report.summary.net)}
              sub={report.summary.net >= 0 ? 'Surplus' : 'Deficit'}
              tone={report.summary.net >= 0 ? 'pos' : 'neg'}
            />
            <StatTile label="Transactions" value={report.summary.txnCount} sub="In period" />
          </div>

          <div className="mb-5">
            <DetailCard title="Money in vs out">
              {report.byMonth.length ? <InVsOutChart data={report.byMonth} /> : <NoData />}
            </DetailCard>
          </div>

          <div className="mb-4">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[{ id: 'spend' as const, label: 'Spend' }, { id: 'income' as const, label: 'Income' }]}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <DetailCard title={tab === 'spend' ? 'Spend by category' : 'Income by source'}>
              {cats.length ? <CategoryDonut data={toSlices(cats)} /> : <NoData />}
            </DetailCard>
            <DetailCard title="Breakdown">
              <CategoryBreakdown items={cats} />
            </DetailCard>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryBreakdown({ items }: { items: ReportCategoryAmount[] }) {
  if (!items.length) return <NoData />;
  return (
    <div className="space-y-3">
      {items.map((c, i) => (
        <div key={c.accountId ?? c.name}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
              <span className="truncate text-[13px]" style={{ color: 'var(--text-1)' }}>{c.name}</span>
            </div>
            <span className="num shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
              {formatINRShort(c.amount)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(c.percentage, 100)}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-9 text-right text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
              {c.percentage.toFixed(c.percentage < 10 ? 1 : 0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NoData() {
  return <p className="py-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>No data for this period</p>;
}
