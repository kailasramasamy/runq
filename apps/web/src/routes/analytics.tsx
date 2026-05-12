import { useMemo, useState } from 'react';
import { Send, Landmark, ArrowDownCircle, ArrowUpCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useToast } from '@/components/ui';
import { useDeclarePageWidth } from '@/lib/page-width';
import { formatINR } from '@/lib/utils';
import {
  useCashPosition,
  useArOutstanding,
  useApOutstanding,
  useSalesMtd,
  useBillsDueWeek,
  useArAging,
  useApAging,
  useTopOverdueCustomers,
  useTopVendorsBySpend,
  useTopExpenseCategories,
  useRevenueVsExpense12mo,
  useBankBalanceTrend90d,
  useDsoTrend6mo,
  usePnlSummary,
  useBsSummary,
  useTrialBalanceSummary,
  useUnreconciledBankTxns,
  useSuspenseSummary,
  usePendingApprovals,
  useSendOverdueReminder,
  useGstr1Vs3b,
  useGstr2bRecon,
  useGstLiability,
  useVendorsNotFiled,
  useCashRunway,
  useGrossMargin,
  useCashFlowSummary,
  useCashForecast,
  type AgingPayload,
  type PnlPeriod,
} from '@/hooks/queries/use-analytics';
import { RevenueVsExpenseChart, BankBalanceChart, DsoChart } from '@/components/analytics/charts';
import { SectionNav } from '@/components/analytics/section-nav';
import { SectionLabel } from '@/components/analytics/section-label';
import { CardShell } from '@/components/analytics/card-shell';
import { StatusPill } from '@/components/analytics/status-pill';
import { KpiStrip } from '@/components/analytics/kpi-strip';
import { AlertBanner, type AnalyticsAlert } from '@/components/analytics/alert-banner';

const SECTIONS = [
  { id: 'sec-performance',  label: 'Performance'   },
  { id: 'sec-cash',         label: 'Cash'          },
  { id: 'sec-arap',         label: 'AR / AP'       },
  { id: 'sec-activity',     label: 'Activity'      },
  { id: 'sec-books',        label: 'Books'         },
  { id: 'sec-profitability',label: 'Profitability' },
  { id: 'sec-gst',          label: 'GST'           },
];

export function AnalyticsPage() {
  useDeclarePageWidth('full');
  const navigate = useNavigate();

  // Hooks (all loaded; cards render their own loading/empty states)
  const cashPos = useCashPosition();
  const ar      = useArOutstanding();
  const ap      = useApOutstanding();
  const pnl     = usePnlSummary('fy');
  const fc      = useCashForecast();
  const bs      = useBsSummary();
  const salesMtd = useSalesMtd();

  const alerts = useMemo<AnalyticsAlert[]>(() => {
    const out: AnalyticsAlert[] = [];
    if (fc.data && fc.data.projectedAt7d < 0) {
      out.push({
        id: 'cash-neg',
        severity: 'critical',
        message: 'Cash projected to go negative in 7 days — review collections immediately',
        ctaLabel: 'View banking',
        onCta: () => navigate({ to: '/banking' }),
      });
    }
    if (bs.data && !bs.data.balanced) {
      out.push({
        id: 'bs-imbalanced',
        severity: 'critical',
        message: 'Balance Sheet is imbalanced — equity mismatch requires investigation',
        ctaLabel: 'View BS',
        onCta: () => navigate({ to: '/reports/balance-sheet' }),
      });
    }
    if (salesMtd.data && salesMtd.data.prevAmount > 0) {
      const delta = ((salesMtd.data.amount - salesMtd.data.prevAmount) / salesMtd.data.prevAmount) * 100;
      if (delta < -25) {
        out.push({
          id: 'sales-drop',
          severity: 'warning',
          message: `Sales this month ${formatINR(salesMtd.data.amount)} — down ${Math.abs(delta).toFixed(0)}% vs last month ${formatINR(salesMtd.data.prevAmount)}`,
          ctaLabel: 'View invoices',
          onCta: () => navigate({ to: '/ar/invoices' }),
        });
      }
    }
    return out;
  }, [fc.data, bs.data, salesMtd.data, navigate]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SectionNav sections={SECTIONS} />

      <div className="px-1 pt-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>Analytics</h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
              Cash, receivables, payables, and books health at a glance.
            </p>
          </div>
        </header>

        <AlertBanner alerts={alerts} />

        <KpiStrip
          tiles={[
            {
              label: 'Cash on hand',
              value: cashPos.data ? formatINR(cashPos.data.total) : '—',
              sub: cashPos.data ? `${cashPos.data.byAccount.length} bank account${cashPos.data.byAccount.length === 1 ? '' : 's'}` : '',
              icon: Landmark,
              tone: 'neutral',
              ctaLabel: 'View banking',
              onCta: () => navigate({ to: '/banking' }),
              loading: cashPos.isLoading,
            },
            {
              label: 'Outstanding receivables',
              value: ar.data ? formatINR(ar.data.total) : '—',
              sub: ar.data ? `${ar.data.invoiceCount} open invoice${ar.data.invoiceCount === 1 ? '' : 's'}` : '',
              icon: ArrowDownCircle,
              tone: 'accent',
              ctaLabel: 'View invoices',
              onCta: () => navigate({ to: '/ar/invoices' }),
              loading: ar.isLoading,
            },
            {
              label: 'Outstanding payables',
              value: ap.data ? formatINR(ap.data.total) : '—',
              sub: ap.data ? `${ap.data.invoiceCount} open bill${ap.data.invoiceCount === 1 ? '' : 's'}` : '',
              icon: ArrowUpCircle,
              tone: 'neg',
              ctaLabel: 'View bills',
              onCta: () => navigate({ to: '/ap/bills' }),
              loading: ap.isLoading,
            },
            {
              label: 'Net profit (FY to date)',
              value: pnl.data ? formatINR(pnl.data.netProfit) : '—',
              sub: pnl.data ? `${pnl.data.period.from} → ${pnl.data.period.to}` : '',
              icon: TrendingUp,
              tone: 'pos',
              ctaLabel: 'View P&L',
              onCta: () => navigate({ to: '/reports/profit-and-loss' }),
              loading: pnl.isLoading,
            },
          ]}
        />

        {/* Section 1 — Performance */}
        <SectionLabel id="sec-performance" title="Performance" sub="Last 12 months" />
        <div className="mb-7 grid gap-4" style={{ gridTemplateColumns: '1.6fr 1fr 1fr' }}>
          <RevExpCard onDrill={() => navigate({ to: '/reports/profit-and-loss' })} />
          <BankTrendCard onDrill={() => navigate({ to: '/banking' })} />
          <DsoCard onDrill={() => navigate({ to: '/ar/invoices' })} />
        </div>

        {/* Section 2 — Cash & Liquidity */}
        <SectionLabel id="sec-cash" title="Cash & Liquidity" />
        <div className="mb-7 grid grid-cols-3 gap-4">
          <CashPositionCard onDrill={() => navigate({ to: '/banking' })} />
          <CashForecastCard onDrill={() => navigate({ to: '/banking' })} />
          <RunwayCashFlowCard onDrill={() => navigate({ to: '/reports/cash-flow' })} />
        </div>

        {/* Section 3 — Receivables & Payables */}
        <SectionLabel id="sec-arap" title="Receivables & Payables" />
        <div className="mb-7 grid grid-cols-3 gap-4">
          <ArAgingCard onDrill={() => navigate({ to: '/ar/invoices' })} />
          <ApAgingCard onDrill={() => navigate({ to: '/ap/bills' })} />
          <TopOverdueCustomersCard onDrill={() => navigate({ to: '/ar/invoices' })} />
        </div>

        {/* Section 4 — Activity */}
        <SectionLabel id="sec-activity" title="Activity" />
        <div className="mb-7 grid grid-cols-3 gap-4">
          <SalesMtdCard onDrill={() => navigate({ to: '/ar/invoices' })} />
          <BillsDueWeekCard onDrill={() => navigate({ to: '/ap/bills' })} />
          <TopVendorsBySpendCard onDrill={() => navigate({ to: '/ap/bills' })} />
        </div>

        {/* Section 5 — Books Health */}
        <SectionLabel id="sec-books" title="Books Health" />
        <div className="mb-3 grid grid-cols-4 gap-4">
          <PnlCard onDrill={() => navigate({ to: '/reports/profit-and-loss' })} />
          <BsCard onDrill={() => navigate({ to: '/reports/balance-sheet' })} />
          <TbCard onDrill={() => navigate({ to: '/reports/trial-balance' })} />
          <UnreconciledCard onDrill={() => navigate({ to: '/banking' })} />
        </div>
        <div className="mb-7 grid grid-cols-2 gap-4">
          <SuspenseCard onDrill={() => navigate({ to: '/gl' })} />
          <PendingApprovalsCard onDrill={() => navigate({ to: '/inbox' })} />
        </div>

        {/* Section 6 — Profitability */}
        <SectionLabel id="sec-profitability" title="Profitability" />
        <div className="mb-7 grid grid-cols-3 gap-4">
          <GrossMarginCard onDrill={() => navigate({ to: '/reports/profit-and-loss' })} />
          <CashFlowCard onDrill={() => navigate({ to: '/reports/cash-flow' })} />
          <TopExpenseCategoriesCard onDrill={() => navigate({ to: '/reports' })} />
        </div>

        {/* Section 7 — GST Compliance */}
        <SectionLabel id="sec-gst" title="GST Compliance" sub="Previous filing period" />
        <div className="mb-10 grid grid-cols-4 gap-4">
          <GstLiabilityCard onDrill={() => navigate({ to: '/gst' })} />
          <Gstr2bReconCard onDrill={() => navigate({ to: '/gst' })} />
          <Gstr1Vs3bCard onDrill={() => navigate({ to: '/gst' })} />
          <VendorsNotFiledCard onDrill={() => navigate({ to: '/gst' })} />
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

const Mono = ({ size, color, weight, children, style }: {
  size: number; color?: string; weight?: number; children: React.ReactNode; style?: React.CSSProperties;
}) => (
  <span
    className="font-mono tabular-nums"
    style={{ fontSize: size, fontWeight: weight ?? 700, color: color ?? 'var(--text-1)', letterSpacing: '-0.02em', ...style }}
  >
    {children}
  </span>
);

const Row = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <li className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
    <span style={{ color: 'var(--text-3)' }}>{label}</span>
    <span className="font-mono tabular-nums" style={{ color: color ?? 'var(--text-1)' }}>{value}</span>
  </li>
);

// ─────────────────────────────────────────────────────────────────────
// Section 1 — Performance charts
// ─────────────────────────────────────────────────────────────────────

function RevExpCard({ onDrill }: { onDrill: () => void }) {
  const q = useRevenueVsExpense12mo();
  const d = q.data?.data;
  return (
    <CardShell
      title="Revenue vs Expense"
      subtitle="Last 12 months"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || (d.totalRevenue === 0 && d.totalExpense === 0)}
      emptyHint="No posted journal entries in this window"
      onDrillDown={onDrill}
      drillDownLabel="View P&L"
      footer={d ? `Revenue ${formatINR(d.totalRevenue)} · Expense ${formatINR(d.totalExpense)}` : null}
    >
      {d && <RevenueVsExpenseChart data={d.months} />}
    </CardShell>
  );
}

function BankTrendCard({ onDrill }: { onDrill: () => void }) {
  const q = useBankBalanceTrend90d();
  const d = q.data?.data;
  return (
    <CardShell
      title="Bank Balance Trend"
      subtitle="Last 90 days · all accounts"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.accounts.length === 0}
      emptyHint="No bank accounts yet"
      onDrillDown={onDrill}
      drillDownLabel="View banking"
      footer={d?.totalSeries.length
        ? `${d.accounts.length} account${d.accounts.length === 1 ? '' : 's'} · today ${formatINR(d.totalSeries[d.totalSeries.length - 1].balance)}`
        : null}
    >
      {d && d.totalSeries.length > 0 && <BankBalanceChart data={d.totalSeries} />}
    </CardShell>
  );
}

function DsoCard({ onDrill }: { onDrill: () => void }) {
  const q = useDsoTrend6mo();
  const d = q.data?.data;
  return (
    <CardShell
      title="Days Sales Outstanding"
      subtitle="DSO trend, 6 months"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.months.every((m) => m.dso == null)}
      emptyHint="Not enough sales history yet"
      onDrillDown={onDrill}
      drillDownLabel="View invoices"
      footer={d ? (
        <span>
          Latest <span className="font-mono font-semibold" style={{ color: 'var(--warn)' }}>{d.latestDso ?? '—'}d</span>
          {' '}· Avg <span className="font-mono font-semibold">{d.averageDso ?? '—'}d</span>
        </span>
      ) : null}
    >
      {d && <DsoChart data={d.months} />}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 — Cash & Liquidity
// ─────────────────────────────────────────────────────────────────────

function CashPositionCard({ onDrill }: { onDrill: () => void }) {
  const q = useCashPosition();
  const d = q.data;
  return (
    <CardShell
      title="Cash Position"
      subtitle="Across all bank accounts"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.byAccount.length === 0}
      emptyHint="No bank accounts yet"
      onDrillDown={onDrill}
      drillDownLabel="View banking"
      footer={d ? `${d.byAccount.length} account${d.byAccount.length === 1 ? '' : 's'}` : null}
    >
      {d && (
        <>
          <Mono size={24} style={{ letterSpacing: '-0.03em' }}>{formatINR(d.total)}</Mono>
          <ul className="mt-3 space-y-1.5">
            {d.byAccount.slice(0, 3).map((a) => (
              <li key={a.accountId} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                <span className="truncate" style={{ color: 'var(--text-2)' }}>{a.accountName}</span>
                <Mono size={12} weight={400} color="var(--text-2)">{formatINR(a.balance)}</Mono>
              </li>
            ))}
            {d.byAccount.length > 3 && (
              <li style={{ fontSize: 11, color: 'var(--text-3)' }}>+{d.byAccount.length - 3} more</li>
            )}
          </ul>
        </>
      )}
    </CardShell>
  );
}

function CashForecastCard({ onDrill }: { onDrill: () => void }) {
  const q = useCashForecast();
  const d = q.data;
  const Window = ({ label, win, projected }: { label: string; win: { inflow: number; outflow: number; receivableCount: number; payableCount: number }; projected: number }) => {
    const negative = projected < 0;
    return (
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}</span>
          <Mono size={13} weight={700} color={negative ? 'var(--neg)' : 'var(--text-1)'}>
            {projected < 0 ? '−' : ''}{formatINR(Math.abs(projected))}
          </Mono>
        </div>
        <p className="mt-1" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--pos)' }}>+{formatINR(win.inflow)}</span>
          {' · '}
          <span style={{ color: 'var(--neg)' }}>−{formatINR(win.outflow)}</span>
          {' · '}
          {win.receivableCount} in / {win.payableCount} out
        </p>
      </div>
    );
  };
  const cashRunsOut = d && (d.projectedAt7d < 0 || d.projectedAt30d < 0);

  return (
    <CardShell
      title="Cash Forecast"
      subtitle="Projected from open AR / AP due dates"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View banking"
      footer={d
        ? (cashRunsOut
            ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠ Cash projected to go negative</span>
            : <span style={{ color: 'var(--pos)' }}>Positive across both windows</span>)
        : null}
    >
      {d && (
        <div className="space-y-2">
          <Window label="7 days from now"  win={d.next7d}  projected={d.projectedAt7d}  />
          <Window label="30 days from now" win={d.next30d} projected={d.projectedAt30d} />
        </div>
      )}
    </CardShell>
  );
}

function RunwayCashFlowCard({ onDrill }: { onDrill: () => void }) {
  const runway = useCashRunway();
  const cf = useCashFlowSummary();
  const loading = runway.isLoading || cf.isLoading;
  const d = runway.data;
  const c = cf.data;
  return (
    <CardShell
      title="Runway & Cash Flow"
      subtitle="Burn rate and FY-to-date flow"
      loading={loading}
      error={runway.error || cf.error ? 'Failed to load' : null}
      empty={!d && !c}
      onDrillDown={onDrill}
      drillDownLabel="View statement"
      footer={c ? `${c.period.from} → ${c.period.to}` : null}
    >
      <div className="grid grid-cols-2 gap-2">
        {d && (
          <>
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Runway</p>
              <Mono size={16} color={d.runwayMonths === null ? 'var(--pos)' : 'var(--text-1)'}>
                {d.runwayMonths === null ? '∞' : `${d.runwayMonths}mo`}
              </Mono>
              <p style={{ fontSize: 10.5, color: d.runwayMonths === null ? 'var(--pos)' : 'var(--text-3)', marginTop: 2 }}>
                {d.runwayMonths === null ? 'Cash-positive 30d+' : 'At current burn'}
              </p>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net burn 30d</p>
              <Mono size={13} weight={600}>{d.netBurn30d >= 0 ? '+' : ''}{formatINR(d.netBurn30d)}</Mono>
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>Cash: {formatINR(d.cashOnHand)}</p>
            </div>
          </>
        )}
      </div>
      {c && (
        <ul className="mt-3 space-y-1.5">
          <Row label="Operating"  value={formatINR(c.operating)}  color={c.operating  < 0 ? 'var(--neg)' : 'var(--pos)'} />
          <Row label="Investing"  value={formatINR(c.investing)}  color={c.investing  < 0 ? 'var(--neg)' : 'var(--pos)'} />
          <Row label="Financing"  value={formatINR(c.financing)}  color="var(--text-3)" />
          <li
            className="mt-2 flex items-center justify-between gap-2 pt-2"
            style={{ fontSize: 12, fontWeight: 700, borderTop: '1px solid var(--border-soft)' }}
          >
            <span style={{ color: 'var(--text-2)' }}>Net cash flow</span>
            <Mono size={12} weight={700} color={c.netChange >= 0 ? 'var(--pos)' : 'var(--neg)'}>
              {c.netChange >= 0 ? '+' : ''}{formatINR(c.netChange)}
            </Mono>
          </li>
        </ul>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — AR / AP
// ─────────────────────────────────────────────────────────────────────

function AgingCard({
  title, subtitle, data, loading, error, onDrill, drillLabel,
}: {
  title: string; subtitle: string;
  data: { data: AgingPayload | null; computedAt: string | null } | undefined;
  loading: boolean; error: unknown; onDrill: () => void; drillLabel: string;
}) {
  const payload = data?.data;
  const max = payload ? Math.max(...payload.buckets.map((b) => b.amount), 1) : 1;
  const colorFor = (key: string) =>
    key === '0-30' || key === '31-60' ? 'var(--accent)' :
    key === '61-90' ? 'var(--warn)' : 'var(--neg)';
  return (
    <CardShell
      title={title}
      subtitle={subtitle}
      loading={loading}
      error={error ? 'Failed to load' : null}
      empty={!payload || payload.totalCount === 0}
      emptyHint="Nothing outstanding"
      onDrillDown={onDrill}
      drillDownLabel={drillLabel}
      footer={payload ? `${payload.totalCount} open · total ${formatINR(payload.total)}` : null}
    >
      {payload && (
        <>
          <Mono size={22}>{formatINR(payload.total)}</Mono>
          <ul className="mt-3 space-y-2">
            {payload.buckets.map((b) => (
              <li key={b.key} className="grid items-center gap-2" style={{ gridTemplateColumns: '38px 1fr 106px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{b.key}</span>
                <div className="relative overflow-hidden" style={{ height: 5, borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                  <div className="h-full" style={{ width: `${(b.amount / max) * 100}%`, background: colorFor(b.key) }} />
                </div>
                <Mono size={11} weight={400} color="var(--text-2)" style={{ textAlign: 'right' }}>{formatINR(b.amount)}</Mono>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardShell>
  );
}

function ArAgingCard({ onDrill }: { onDrill: () => void }) {
  const q = useArAging();
  return <AgingCard title="Receivables Aging" subtitle="By days overdue" data={q.data} loading={q.isLoading} error={q.error} onDrill={onDrill} drillLabel="View invoices" />;
}
function ApAgingCard({ onDrill }: { onDrill: () => void }) {
  const q = useApAging();
  return <AgingCard title="Payables Aging" subtitle="By days overdue" data={q.data} loading={q.isLoading} error={q.error} onDrill={onDrill} drillLabel="View bills" />;
}

function TopOverdueCustomersCard({ onDrill }: { onDrill: () => void }) {
  const q = useTopOverdueCustomers();
  const send = useSendOverdueReminder();
  const { toast } = useToast();
  const payload = q.data?.data;

  function handleSend(customerId: string, customerName: string) {
    send.mutate({ customerId }, {
      onSuccess: (r) => toast(`Reminder queued for ${customerName} — ${r.invoiceCount} ${r.invoiceCount === 1 ? 'invoice' : 'invoices'}`, 'success'),
      onError:   (e) => toast((e as Error).message || 'Failed to send reminder', 'error'),
    });
  }

  // Dot hue cycle per design handoff
  const HUES = [268, 155, 75, 305, 200];
  return (
    <CardShell
      title="Top Overdue Customers"
      subtitle="By amount outstanding"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!payload || payload.items.length === 0}
      emptyHint="No overdue customers"
      onDrillDown={onDrill}
      drillDownLabel="View invoices"
      footer={payload ? `${payload.items.length} customers · ${formatINR(payload.totalAmount)}` : null}
    >
      {payload && payload.items.length > 0 && (
        <ul className="space-y-2">
          {payload.items.slice(0, 4).map((c, i) => {
            const sending = send.isPending && send.variables?.customerId === c.customerId;
            return (
              <li key={c.customerId} className="flex items-center gap-2">
                <span className="inline-block flex-shrink-0" style={{ width: 6, height: 6, borderRadius: 99, background: `oklch(0.7 0.14 ${HUES[i % HUES.length]})` }} />
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{c.customerName}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{c.maxDaysOverdue}d overdue</span>
                <Mono size={12} weight={500} color="var(--neg)">{formatINR(c.balanceDue)}</Mono>
                <button
                  type="button"
                  onClick={() => handleSend(c.customerId, c.customerName)}
                  disabled={sending}
                  className="transition-colors disabled:opacity-50"
                  style={{ color: 'var(--text-3)' }}
                  title={sending ? 'Sending…' : 'Send reminder'}
                >
                  <Send size={12} className={sending ? 'animate-pulse' : ''} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — Activity
// ─────────────────────────────────────────────────────────────────────

function SalesMtdCard({ onDrill }: { onDrill: () => void }) {
  const q = useSalesMtd();
  const d = q.data;
  return (
    <CardShell
      title="Sales This Month"
      subtitle="Invoices dated this month"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.count === 0}
      emptyHint="No invoices yet this month"
      onDrillDown={onDrill}
      drillDownLabel="View invoices"
      footer={d ? `${d.count} invoice${d.count === 1 ? '' : 's'}` : null}
    >
      {d && (
        <>
          <Mono size={24}>{formatINR(d.amount)}</Mono>
          {d.prevAmount > 0 && (() => {
            const delta = ((d.amount - d.prevAmount) / d.prevAmount) * 100;
            const down = delta < 0;
            return (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Last month: {formatINR(d.prevAmount)}</span>
                <span
                  style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '2px 7px', borderRadius: 99,
                    background: down ? 'var(--neg-soft)' : 'var(--pos-soft)',
                    color: down ? 'var(--neg)' : 'var(--pos)',
                  }}
                >
                  {down ? '↘' : '↗'} {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
              </div>
            );
          })()}
        </>
      )}
    </CardShell>
  );
}

function BillsDueWeekCard({ onDrill }: { onDrill: () => void }) {
  const q = useBillsDueWeek();
  const d = q.data;
  return (
    <CardShell
      title="Bills Due This Week"
      subtitle="Next 7 days"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.items.length === 0}
      emptyHint="No bills due"
      onDrillDown={onDrill}
      drillDownLabel="View bills"
      footer={d ? `${d.items.length} bill${d.items.length === 1 ? '' : 's'}` : null}
    >
      {d && d.items.length > 0 && (
        <>
          <Mono size={24}>{formatINR(d.totalAmount)}</Mono>
          <ul className="mt-3 space-y-1.5">
            {d.items.slice(0, 3).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-2)' }}>{b.vendorName}</span>
                <Mono size={12} weight={500} color="var(--text-2)">{formatINR(b.balanceDue)}</Mono>
              </li>
            ))}
            {d.items.length > 3 && (
              <li style={{ fontSize: 11, color: 'var(--text-3)' }}>+{d.items.length - 3} more</li>
            )}
          </ul>
        </>
      )}
    </CardShell>
  );
}

function TopVendorsBySpendCard({ onDrill }: { onDrill: () => void }) {
  const q = useTopVendorsBySpend();
  const payload = q.data?.data;
  const max = payload ? Math.max(...payload.items.map((v) => v.totalSpend), 1) : 1;
  return (
    <CardShell
      title="Top Vendors by Spend"
      subtitle="Last 90 days"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!payload || payload.items.length === 0}
      emptyHint="No vendor spend in window"
      onDrillDown={onDrill}
      drillDownLabel="View bills"
      footer={payload ? `${payload.items.length} vendors` : null}
    >
      {payload && payload.items.length > 0 && (
        <>
          <ul className="space-y-2">
            {payload.items.slice(0, 5).map((v) => (
              <li key={v.vendorId}>
                <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-1)' }}>{v.vendorName}</span>
                  <Mono size={12} weight={500} color="var(--text-2)">{formatINR(v.totalSpend)}</Mono>
                </div>
                <div className="mt-1 overflow-hidden" style={{ height: 3, borderRadius: 99, background: 'var(--surface-2)' }}>
                  <div className="h-full" style={{ width: `${(v.totalSpend / max) * 100}%`, background: 'var(--accent)', opacity: 0.5 }} />
                </div>
              </li>
            ))}
          </ul>
          {payload.items.length > 5 && (
            <p className="mt-2" style={{ fontSize: 11, color: 'var(--text-3)' }}>
              +{payload.items.length - 5} more · total {formatINR(payload.totalAmount)}
            </p>
          )}
        </>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 5 — Books Health
// ─────────────────────────────────────────────────────────────────────

function PnlCard({ onDrill }: { onDrill: () => void }) {
  const [period, setPeriod] = useState<PnlPeriod>('fy');
  const q = usePnlSummary(period);
  const d = q.data;
  const positive = (d?.netProfit ?? 0) >= 0;
  const periodSelector = (
    <select
      value={period}
      onChange={(e) => setPeriod(e.target.value as PnlPeriod)}
      style={{
        fontSize: 11, padding: '2px 6px', borderRadius: 6,
        border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)',
      }}
      aria-label="P&L period"
    >
      <option value="fy">FY</option>
      <option value="qtr">QTD</option>
      <option value="month">MTD</option>
    </select>
  );
  return (
    <CardShell
      title="Profit & Loss"
      subtitle={period === 'fy' ? 'FY to date' : period === 'qtr' ? 'Quarter to date' : 'Month to date'}
      actions={periodSelector}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View P&L"
      footer={d ? `${d.period.from} → ${d.period.to}` : null}
    >
      {d && (
        <>
          <Mono size={22} color={positive ? 'var(--pos)' : 'var(--neg)'}>{formatINR(d.netProfit)}</Mono>
          <ul className="mt-3 space-y-1.5">
            <Row label="Revenue" value={formatINR(d.totalRevenue)} />
            <Row label="Expense" value={formatINR(d.totalExpense)} />
          </ul>
        </>
      )}
    </CardShell>
  );
}

function BsCard({ onDrill }: { onDrill: () => void }) {
  const q = useBsSummary();
  const d = q.data;
  return (
    <CardShell
      title="Balance Sheet"
      subtitle={d ? `As on ${d.asOfDate}` : 'As on today'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View BS"
      borderTone={d && !d.balanced ? 'neg' : 'default'}
      footer={d ? (
        <StatusPill tone={d.balanced ? 'ok' : 'neg'}>
          {d.balanced ? 'Balanced' : 'Imbalanced — investigate'}
        </StatusPill>
      ) : null}
    >
      {d && (
        <ul className="space-y-1.5">
          <Row label="Assets"      value={formatINR(d.totalAssets)} />
          <Row label="Liabilities" value={formatINR(d.totalLiabilities)} />
          <Row label="Equity"      value={formatINR(d.totalEquity)} color={d.totalEquity < 0 ? 'var(--neg)' : undefined} />
        </ul>
      )}
    </CardShell>
  );
}

function TbCard({ onDrill }: { onDrill: () => void }) {
  const q = useTrialBalanceSummary();
  const d = q.data;
  return (
    <CardShell
      title="Trial Balance"
      subtitle={d ? `As on ${d.asOfDate}` : 'As on today'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View TB"
      footer={d ? (
        <StatusPill tone={d.balanced ? 'ok' : 'warn'}>
          {d.balanced ? `Balanced · ${d.accountCount} accounts` : 'Imbalanced — needs review'}
        </StatusPill>
      ) : null}
    >
      {d && (
        <ul className="space-y-1.5">
          <Row label="Total debits"  value={formatINR(d.totalDebit)} />
          <Row label="Total credits" value={formatINR(d.totalCredit)} />
        </ul>
      )}
    </CardShell>
  );
}

function UnreconciledCard({ onDrill }: { onDrill: () => void }) {
  const q = useUnreconciledBankTxns();
  const d = q.data;
  const clean = d && d.count === 0;
  return (
    <CardShell
      title="Unreconciled Txns"
      subtitle="Across all bank accounts"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View banking"
      footer={d ? (
        clean ? <StatusPill tone="ok">All reconciled</StatusPill>
              : <span>{d.count} unreconciled · {formatINR(d.total)}</span>
      ) : null}
    >
      {d && (
        <Mono size={32} color={clean ? 'var(--pos)' : 'var(--text-1)'}>{d.count}</Mono>
      )}
    </CardShell>
  );
}

function SuspenseCard({ onDrill }: { onDrill: () => void }) {
  const q = useSuspenseSummary();
  const d = q.data;
  return (
    <CardShell
      title="Suspense / Clearing"
      subtitle={d ? `As on ${d.asOf}` : 'As on today'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.accounts.length === 0}
      emptyHint="No suspense / clearing accounts"
      onDrillDown={onDrill}
      drillDownLabel="View GL"
      footer={d ? (
        <StatusPill tone={d.clean ? 'ok' : 'warn'}>
          {d.clean ? 'All clear' : `${d.totalStuck} stuck · investigate`}
        </StatusPill>
      ) : null}
    >
      {d && d.accounts.length > 0 && (
        <>
          <Mono size={22} color={d.clean ? 'var(--pos)' : 'var(--warn)'}>
            {d.clean ? '₹0.00' : formatINR(d.totalAbsBalance)}
          </Mono>
          <ul className="mt-3 space-y-1.5">
            {d.accounts.map((a) => (
              <li key={a.accountId} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-2)' }}>
                  {a.accountName} <span style={{ color: 'var(--text-3)' }}>· {a.accountCode}</span>
                </span>
                <Mono size={12} weight={400} color={Math.abs(a.balance) > 0.01 ? 'var(--warn)' : 'var(--text-3)'}>
                  {Math.abs(a.balance) < 0.01 ? '₹0.00' : formatINR(a.balance)}
                </Mono>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardShell>
  );
}

function PendingApprovalsCard({ onDrill }: { onDrill: () => void }) {
  const q = usePendingApprovals();
  const d = q.data;
  return (
    <CardShell
      title="Pending Approvals"
      subtitle="Awaiting reviewer action"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="Open inbox"
      footer={d ? (
        d.total === 0 ? <StatusPill tone="ok">Nothing waiting</StatusPill>
                      : `${d.byEntityType.length} ${d.byEntityType.length === 1 ? 'category' : 'categories'}`
      ) : null}
    >
      {d && (
        <Mono size={32} color={d.total === 0 ? 'var(--pos)' : 'var(--text-1)'}>{d.total}</Mono>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 6 — Profitability
// ─────────────────────────────────────────────────────────────────────

function GrossMarginCard({ onDrill }: { onDrill: () => void }) {
  const q = useGrossMargin();
  const d = q.data;
  return (
    <CardShell
      title="Gross Margin"
      subtitle="FY to date"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || d.revenue === 0}
      emptyHint="No revenue posted yet this FY"
      onDrillDown={onDrill}
      drillDownLabel="View P&L"
      footer={d ? `${d.period.from} → ${d.period.to}` : null}
    >
      {d && d.revenue > 0 && (
        <>
          <Mono size={28}>{d.marginPct === null ? '—' : `${d.marginPct.toFixed(1)}%`}</Mono>
          <ul className="mt-3 space-y-1.5">
            <Row label="Revenue"      value={formatINR(d.revenue)} />
            <Row label="COGS"         value={formatINR(d.cogs)} />
            <li
              className="mt-2 flex items-center justify-between gap-2 pt-2"
              style={{ fontSize: 12, fontWeight: 700, borderTop: '1px solid var(--border-soft)' }}
            >
              <span style={{ color: 'var(--text-2)' }}>Gross profit</span>
              <Mono size={12} weight={700}>{formatINR(d.grossProfit)}</Mono>
            </li>
          </ul>
        </>
      )}
    </CardShell>
  );
}

function CashFlowCard({ onDrill }: { onDrill: () => void }) {
  const q = useCashFlowSummary();
  const d = q.data;
  return (
    <CardShell
      title="Cash Flow"
      subtitle="FY to date, indirect method"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View statement"
      footer={d ? `${d.period.from} → ${d.period.to}` : null}
    >
      {d && (
        <>
          <Mono size={22} color={d.netChange >= 0 ? 'var(--pos)' : 'var(--neg)'}>
            {d.netChange >= 0 ? '+' : ''}{formatINR(d.netChange)}
          </Mono>
          <ul className="mt-3 space-y-1.5">
            <Row label="Operating" value={formatINR(d.operating)} color={d.operating < 0 ? 'var(--neg)' : 'var(--pos)'} />
            <Row label="Investing" value={formatINR(d.investing)} color={d.investing < 0 ? 'var(--neg)' : 'var(--pos)'} />
            <Row label="Financing" value={formatINR(d.financing)} color="var(--text-3)" />
          </ul>
        </>
      )}
    </CardShell>
  );
}

function TopExpenseCategoriesCard({ onDrill }: { onDrill: () => void }) {
  const q = useTopExpenseCategories();
  const payload = q.data?.data;
  const max = payload ? Math.max(...payload.items.map((c) => c.amount), 1) : 1;
  return (
    <CardShell
      title="Top Expense Categories"
      subtitle="This month, from GL"
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!payload || payload.items.length === 0}
      emptyHint="No expenses posted this month"
      onDrillDown={onDrill}
      drillDownLabel="View reports"
      footer={payload ? `${payload.items.length} accounts · total ${formatINR(payload.totalAmount)}` : null}
    >
      {payload && payload.items.length > 0 && (
        <ul className="space-y-2">
          {payload.items.slice(0, 5).map((c) => (
            <li key={c.accountId}>
              <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-1)' }}>
                  {c.accountName} <span style={{ color: 'var(--text-3)' }}>· {c.accountCode}</span>
                </span>
                <Mono size={12} weight={500} color="var(--text-2)">{formatINR(c.amount)}</Mono>
              </div>
              <div className="mt-1 overflow-hidden" style={{ height: 4, borderRadius: 99, background: 'var(--surface-2)' }}>
                <div className="h-full" style={{ width: `${(c.amount / max) * 100}%`, background: 'var(--warn)', opacity: 0.65 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 7 — GST Compliance
// ─────────────────────────────────────────────────────────────────────

function GstLiabilityCard({ onDrill }: { onDrill: () => void }) {
  const q = useGstLiability();
  const d = q.data;
  return (
    <CardShell
      title="GST Liability"
      subtitle={d ? d.period.label : 'Previous month'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || !d.has3b}
      emptyHint="GSTR-3B not generated yet for this period"
      onDrillDown={onDrill}
      drillDownLabel="View GST"
      footer={d?.has3b ? `Cash payable ${formatINR(d.totalCashPayable)}` : null}
    >
      {d?.has3b && (
        <>
          <Mono size={22}>{formatINR(d.totalPayable)}</Mono>
          <ul className="mt-3 space-y-1.5">
            <Row label="IGST" value={formatINR(d.igst)} />
            <Row label="CGST" value={formatINR(d.cgst)} />
            <Row label="SGST" value={formatINR(d.sgst)} />
            <Row label="ITC used" value={formatINR(d.totalItcUsed)} />
          </ul>
        </>
      )}
    </CardShell>
  );
}

function Gstr2bReconCard({ onDrill }: { onDrill: () => void }) {
  const q = useGstr2bRecon();
  const d = q.data;
  const pill = !d ? null
    : !d.has2b ? <StatusPill tone="muted">2B not synced</StatusPill>
    : !d.reconRun ? <StatusPill tone="warn">Run reconciliation</StatusPill>
    : d.itcAtRisk > 0 ? <StatusPill tone="warn">{formatINR(d.itcAtRisk)} ITC at risk</StatusPill>
    : <StatusPill tone="ok">All matched</StatusPill>;

  return (
    <CardShell
      title="GSTR-2B vs Purchase Register"
      subtitle={d ? d.period.label : 'Previous month'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || !d.has2b}
      emptyHint="Pull GSTR-2B for this period to start reconciling"
      onDrillDown={onDrill}
      drillDownLabel="View GST"
      footer={pill}
    >
      {d?.has2b && d?.reconRun && (
        <ul className="space-y-1.5">
          <Row label="Matched"      value={d.matched.count}     color="var(--pos)" />
          <Row label="Mismatched"   value={d.mismatched.count}  color="var(--warn)" />
          <Row label="Not in books" value={d.notInBooks.count}  color="var(--text-3)" />
          <Row label="Not in 2B"    value={d.notIn2b.count}     color="var(--text-3)" />
        </ul>
      )}
    </CardShell>
  );
}

function Gstr1Vs3bCard({ onDrill }: { onDrill: () => void }) {
  const q = useGstr1Vs3b();
  const d = q.data;
  const missing = d && (!d.gstr1Available || !d.gstr3bAvailable);
  const footer = !d ? null
    : missing ? (
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--warn)' }}>
        <AlertTriangle size={12} />
        {!d.gstr1Available && !d.gstr3bAvailable ? 'Neither return generated' : !d.gstr1Available ? 'GSTR-1 missing' : 'GSTR-3B missing'}
      </span>
    )
    : <StatusPill tone={d.hasMismatch ? 'warn' : 'ok'}>{d.hasMismatch ? 'Mismatch found' : 'Reconciled'}</StatusPill>;

  return (
    <CardShell
      title="GSTR-1 vs GSTR-3B"
      subtitle={d ? d.period.label : 'Previous month'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d}
      onDrillDown={onDrill}
      drillDownLabel="View GST"
      footer={footer}
    >
      {d && !missing && (
        <ul className="space-y-1.5">
          {d.details.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>{row.label}</span>
              <Mono size={12} weight={400} color={Math.abs(row.delta) > 2 ? 'var(--warn)' : 'var(--text-1)'}>
                {row.delta >= 0 ? '+' : ''}{formatINR(row.delta)}
              </Mono>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function VendorsNotFiledCard({ onDrill }: { onDrill: () => void }) {
  const q = useVendorsNotFiled();
  const d = q.data;
  return (
    <CardShell
      title="Vendors Blocking ITC"
      subtitle={d ? `${d.period.label} · missing in 2B` : 'Previous month'}
      loading={q.isLoading}
      error={q.error ? 'Failed to load' : null}
      empty={!d || !d.has2b || d.vendors.length === 0}
      emptyHint={d && !d.has2b ? '2B not synced for this period' : 'No vendors blocking ITC'}
      onDrillDown={onDrill}
      drillDownLabel="View GST"
      borderTone={q.error ? 'neg' : 'default'}
      footer={d?.vendors.length
        ? `${d.vendors.length} vendor${d.vendors.length === 1 ? '' : 's'} · ${formatINR(d.totalItcAtRisk)} at risk`
        : null}
    >
      {d && d.vendors.length > 0 && (
        <ul className="space-y-1.5">
          {d.vendors.slice(0, 5).map((v) => (
            <li key={v.vendorId} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
              <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-1)' }}>
                {v.vendorName}
                <span className="ml-1" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                  · {v.reason === 'no_gstin' ? 'no GSTIN' : 'not in 2B'}
                </span>
              </span>
              <Mono size={12} weight={500} color="var(--text-2)">{formatINR(v.itcAtRisk)}</Mono>
            </li>
          ))}
          {d.vendors.length > 5 && (
            <li style={{ fontSize: 11, color: 'var(--text-3)' }}>+{d.vendors.length - 5} more</li>
          )}
        </ul>
      )}
    </CardShell>
  );
}
