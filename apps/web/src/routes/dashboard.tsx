import { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  ScanLine,
  Upload,
  ClipboardList,
} from 'lucide-react';
import { OnboardingWizard, OnboardingProgressWidget } from '@/components/onboarding/onboarding-wizard';
import { useOnboarding } from '@/hooks/queries/use-settings';
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
import { GstReadinessWidget } from '@/components/dashboard/gst-readiness';
import { QuickInvoiceWidget } from '@/components/dashboard/quick-invoice';

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
      className="group flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-left transition-all duration-150 hover:border-indigo-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-700"
    >
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50">
        {icon}
      </span>
      <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </button>
  );
}

interface QuickActionMenuOption {
  icon: React.ReactNode;
  label: string;
  to: string;
}

interface QuickActionMenuProps {
  icon: React.ReactNode;
  label: string;
  options: QuickActionMenuOption[];
}

function QuickActionMenu({ icon, label, options }: QuickActionMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-left transition-all duration-150 hover:border-indigo-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-700"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50">
          {icon}
        </span>
        <span className="flex flex-1 items-center justify-between gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <span className="truncate">{label}</span>
          <ChevronDown size={12} className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                setOpen(false);
                navigate({ to: opt.to as '/' });
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {opt.icon}
              </span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
  const { data: onboarding } = useOnboarding();

  const [wizardOpen, setWizardOpen] = useState(false);
  // Auto-open the wizard exactly once for brand-new tenants. Two correctness
  // requirements that the previous render-phase version got wrong:
  //   1. Wait until the onboarding query has actually resolved — `?? false`
  //      defaults made the "should auto-open" condition trip on every page
  //      load *before* the data arrived.
  //   2. Run the open-decision in an effect, not during render. Calling
  //      setState during render is a React anti-pattern.
  // The `autoOpenedRef` guards against re-opening if the user closes the
  // wizard without dismissing or completing — without it, an effect re-run
  // would just slam the modal back open.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!onboarding?.data) return; // query still loading
    const steps = onboarding.data.steps ?? {};
    const count = Object.values(steps).filter(Boolean).length;
    const isFreshTenant =
      !onboarding.data.dismissed && !onboarding.data.completed && count === 0;
    if (isFreshTenant) {
      autoOpenedRef.current = true;
      setWizardOpen(true);
    } else {
      // Even if we don't open, mark as "decided" so we don't re-evaluate
      // on subsequent query refetches.
      autoOpenedRef.current = true;
    }
  }, [onboarding]);

  const isLoading = summary.isLoading;
  const s = summary.data?.data;

  return (
    <div className="space-y-6">
      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Setup strip — pinned at the very top, always visible */}
      <OnboardingProgressWidget onResume={() => setWizardOpen(true)} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Finance & Accounting overview
        </p>
      </div>

      {/* Quick Actions — pinned near top for easy access */}
      <Card>
        <CardHeader title="Quick Actions" />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <QuickActionMenu
              icon={<Plus size={20} />}
              label="New Bill"
              options={[
                { icon: <ScanLine size={14} />, label: 'Scan Invoice', to: '/ap/bills/scan' },
                { icon: <Upload size={14} />, label: 'Import CSV', to: '/ap/bills/import' },
                { icon: <Plus size={14} />, label: 'New Bill', to: '/ap/bills/new' },
              ]}
            />
            <QuickActionMenu
              icon={<FileText size={20} />}
              label="New Invoice"
              options={[
                { icon: <ClipboardList size={14} />, label: 'Create Invoice from PO', to: '/ar/po-inbox' },
                { icon: <Upload size={14} />, label: 'Import', to: '/ar/invoices/import' },
                { icon: <FileText size={14} />, label: 'New Invoice', to: '/ar/invoices/new' },
              ]}
            />
            <QuickAction icon={<CreditCard size={20} />} label="Record Payment" to="/ap/payments/new" />
            <QuickAction icon={<CreditCard size={20} />} label="Record Receipt" to="/ar/receipts/new" />
            <QuickAction icon={<Landmark size={20} />} label="Import Bank Statement" to="/banking/transactions/import" />
          </div>
        </CardContent>
      </Card>

      {/* AI Snapshot */}
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
            icon={Landmark}
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

      {/* Row 4b: GST Readiness */}
      <GstReadinessWidget />

      {/* Row 6: Quick Invoice */}
      <QuickInvoiceWidget />
    </div>
  );
}
