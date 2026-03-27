import { useNavigate } from '@tanstack/react-router';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Plus,
  FileText,
  CreditCard,
  Landmark,
  ArrowRight,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  CardSkeleton,
  StatsCard,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useDashboardSummary,
  usePayablesAging,
  useReceivablesAging,
} from '@/hooks/queries/use-dashboard';
import type { AgingData } from '@/hooks/queries/use-dashboard';
import { PaymentPriorityWidget } from '@/components/dashboard/payment-priority';
import { ExpenseAlertsWidget } from '@/components/dashboard/expense-alerts';
import { AIInsightsWidget } from '@/components/dashboard/ai-insights';
import { CashPositionWidget } from '@/components/dashboard/cash-position';
import { PDCCalendarWidget } from '@/components/dashboard/pdc-calendar';

// ─── Aging Bar Chart ──────────────────────────────────────────────────────────

const AGING_COLORS = [
  'bg-green-500',
  'bg-yellow-400',
  'bg-orange-400',
  'bg-red-500',
  'bg-red-700',
];

function AgingChart({ data }: { data: AgingData }) {
  const max = Math.max(...data.buckets.map((b) => b.amount), 1);

  return (
    <div className="space-y-3">
      {data.buckets.map((bucket, i) => {
        const pct = (bucket.amount / max) * 100;
        return (
          <div key={bucket.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">{bucket.label}</span>
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                {formatINR(bucket.amount)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${AGING_COLORS[i] ?? AGING_COLORS[4]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="border-t border-zinc-200 pt-2 text-right text-xs dark:border-zinc-800">
        <span className="text-zinc-500">Total: </span>
        <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
          {formatINR(data.total)}
        </span>
      </div>
    </div>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  to: string;
}

function QuickAction({ icon, label, to }: QuickActionProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate({ to: to as '/' })}
      className="group flex flex-col items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-center transition-all duration-150 hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-700"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50">
        {icon}
      </div>
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </button>
  );
}

// ─── Default Aging Buckets ────────────────────────────────────────────────────

const EMPTY_AGING: AgingData = {
  total: 0,
  buckets: [
    { label: 'Current', amount: 0 },
    { label: '1–30 days', amount: 0 },
    { label: '31–60 days', amount: 0 },
    { label: '61–90 days', amount: 0 },
    { label: '90+ days', amount: 0 },
  ],
};

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const summary = useDashboardSummary();
  const payablesAging = usePayablesAging();
  const receivablesAging = useReceivablesAging();

  const isLoading = summary.isLoading;
  const s = summary.data?.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Finance & Accounting overview
        </p>
      </div>

      {/* AI Insights */}
      <AIInsightsWidget />

      {/* Row 1: Stats */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatsCard
            title="Outstanding Payables"
            value={s?.outstandingPayables ?? 0}
            icon={TrendingDown}
            className={
              (s?.outstandingPayables ?? 0) > 0
                ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                : ''
            }
          />
          <StatsCard
            title="Outstanding Receivables"
            value={s?.outstandingReceivables ?? 0}
            icon={TrendingUp}
            className={
              (s?.outstandingReceivables ?? 0) > 0
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
                : ''
            }
          />
          <StatsCard
            title="Cash Position"
            value={s?.cashPosition ?? 0}
            className="border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
          />
          <div className="relative overflow-hidden rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <AlertTriangle size={48} className="absolute right-4 top-4 opacity-5 text-red-500 dark:opacity-10" />
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Overdue
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatINR(s?.overdueAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {s?.overdueCount ?? 0} invoice{(s?.overdueCount ?? 0) !== 1 ? 's' : ''} overdue
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <ArrowRight size={48} className="absolute right-4 top-4 opacity-5 text-blue-500 dark:opacity-10" />
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Upcoming (7d)
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatINR(s?.upcomingAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              {s?.upcomingCount ?? 0} due in 7 days
            </p>
          </div>
        </div>
      )}

      {/* Row 2: Aging Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payables Aging" />
          <CardContent>
            {payablesAging.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-2 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : (
              <AgingChart data={payablesAging.data?.data?.buckets ? payablesAging.data.data : EMPTY_AGING} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Receivables Aging" />
          <CardContent>
            {receivablesAging.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-2 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : (
              <AgingChart data={receivablesAging.data?.data?.buckets ? receivablesAging.data.data : EMPTY_AGING} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Cash Position */}
      <CashPositionWidget />

      {/* Row 4: Payment Priority + Expense Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PaymentPriorityWidget />
        <ExpenseAlertsWidget />
      </div>

      {/* Row 5: Upcoming PDCs */}
      <PDCCalendarWidget />

      {/* Row 6: Quick Actions */}
      <Card>
        <CardHeader title="Quick Actions" />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <QuickAction icon={<Plus size={20} />} label="New Bill" to="/ap/bills/new" />
            <QuickAction icon={<FileText size={20} />} label="New Invoice" to="/ar/invoices/new" />
            <QuickAction icon={<CreditCard size={20} />} label="Record Payment" to="/ap/payments/new" />
            <QuickAction icon={<CreditCard size={20} />} label="Record Receipt" to="/ar/receipts/new" />
            <QuickAction icon={<Landmark size={20} />} label="Import Bank Statement" to="/banking/transactions/import" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
