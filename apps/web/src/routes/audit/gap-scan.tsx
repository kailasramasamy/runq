import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useGapScan, useGapItems } from '@/hooks/queries/use-trail';
import type { GapCategorySummary, GapItem } from '@/hooks/queries/use-trail';
import {
  PageHeader, Badge, Select, Button,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Zap, ArrowRight,
} from 'lucide-react';

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800' },
};

const FIX_GUIDES: Record<string, { steps: string[]; autoFix?: { label: string; route: string } }> = {
  uncategorized_bank_txns: {
    steps: [
      'Go to Banking → Transactions',
      'Click "Auto-Categorize" to let AI categorize transactions',
      'For remaining: click "Assign Vendor" or "Assign Customer" on each',
    ],
    autoFix: { label: 'Go to Auto-Categorize', route: '/banking/transactions' },
  },
  matched_without_je: {
    steps: [
      'These transactions were reconciled but no journal entry was created',
      'Re-run Auto-Categorize on the bank account to create missing JEs',
      'Or manually categorize each transaction with a GL account',
    ],
    autoFix: { label: 'Go to Transactions', route: '/banking/transactions' },
  },
  unposted_bills: {
    steps: [
      'These bills exist but have no accounting entry in the General Ledger',
      'Open each bill and ensure it is approved',
      'Approved bills auto-post JEs — if missing, re-save the bill',
    ],
    autoFix: { label: 'Go to Bills', route: '/ap/bills' },
  },
  unposted_invoices: {
    steps: [
      'These invoices exist but have no accounting entry in the General Ledger',
      'Open each invoice and ensure it is sent/approved',
      'Sent invoices auto-post JEs — if missing, re-save the invoice',
    ],
    autoFix: { label: 'Go to Invoices', route: '/ar/invoices' },
  },
  unpaid_bills: {
    steps: [
      'These bills have outstanding balances — vendor has not been paid yet',
      'Go to AP → Payments → record payment against each bill',
      'After payment, sync bank statement and reconcile',
    ],
    autoFix: { label: 'Go to Payments', route: '/ap/payments' },
  },
  unpaid_invoices: {
    steps: [
      'These invoices have outstanding balances — customer has not paid yet',
      'Follow up with the customer for payment',
      'When payment is received, record it under AR → Receipts',
    ],
    autoFix: { label: 'View AR Aging', route: '/ar' },
  },
  unmatched_payments: {
    steps: [
      'Payments recorded in books but not matched to any bank transaction',
      'Import the latest bank statement',
      'Run Auto-Reconcile on the Banking → Reconciliation page',
    ],
    autoFix: { label: 'Go to Reconciliation', route: '/banking/reconciliation' },
  },
  unmatched_receipts: {
    steps: [
      'Receipts recorded in books but not matched to any bank transaction',
      'Import the latest bank statement',
      'Run Auto-Reconcile on the Banking → Reconciliation page',
    ],
    autoFix: { label: 'Go to Reconciliation', route: '/banking/reconciliation' },
  },
};

const DAYS_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 1 year' },
];

export function GapScanPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useGapScan(days);
  const result = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Audit' }, { label: 'Gap Scan' }]}
        title="Accounting Gap Scan"
        description="Scans your books for missing links, unposted entries, and incomplete reconciliations."
        actions={
          <div className="w-44">
            <Select
              options={DAYS_OPTIONS}
              value={String(days)}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            />
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-zinc-500">
          <ShieldCheck className="h-5 w-5 animate-pulse" />
          Scanning last {days} days...
        </div>
      )}

      {result && result.totalGaps === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">All clear</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No gaps found in the last {days} days. Your books are complete.</p>
          <p className="text-xs text-zinc-400">Scanned at {new Date(result.scannedAt).toLocaleString('en-IN')}</p>
        </div>
      )}

      {result && result.totalGaps > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {result.totalGaps} gap{result.totalGaps > 1 ? 's' : ''} found
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              Last {result.daysScanned} days · {new Date(result.scannedAt).toLocaleString('en-IN')}
            </span>
          </div>

          {result.categories.map((cat) => (
            <GapCategoryCard key={cat.key} category={cat} days={days} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCategoryCard({ category, days }: { category: GapCategorySummary; days: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[category.severity];
  const Icon = config.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const guide = FIX_GUIDES[category.key];

  return (
    <div className={`rounded-lg border ${config.border} overflow-hidden`}>
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left ${config.bg} hover:opacity-90`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{category.title}</span>
          <Badge variant="warning">{category.count}</Badge>
        </div>
        <Chevron className="h-4 w-4 text-zinc-400" />
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          {/* Fix guide */}
          {guide && (
            <div className="bg-white px-4 py-3 dark:bg-zinc-900/50">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">How to fix</p>
              <ol className="mb-3 space-y-1">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              {guide.autoFix && (
                <Link to={guide.autoFix.route as '/'}>
                  <Button size="sm" variant="outline">
                    <Zap size={14} />
                    {guide.autoFix.label}
                    <ArrowRight size={14} />
                  </Button>
                </Link>
              )}
            </div>
          )}

          {/* Items table */}
          <GapItemsTable categoryKey={category.key} days={days} />
        </div>
      )}
    </div>
  );
}

function GapItemsTable({ categoryKey, days }: { categoryKey: string; days: number }) {
  const { data, isLoading } = useGapItems(categoryKey, days, true);
  const items = data?.data?.items ?? [];

  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-zinc-400">Loading items...</div>;
  }

  if (items.length === 0) {
    return <div className="px-4 py-3 text-xs text-zinc-400">No items found</div>;
  }

  const isBankTxn = categoryKey.includes('bank_txn') || categoryKey.includes('matched_without');

  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Date</Th>
          <Th>Description</Th>
          <Th>Amount</Th>
          <Th>Action</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <GapItemRow key={item.entityId} item={item} />
        ))}
      </TableBody>
    </Table>
  );
}

function GapItemRow({ item }: { item: GapItem }) {
  return (
    <TableRow>
      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
        {item.date ?? '—'}
      </TableCell>
      <TableCell className="max-w-xs">
        <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{item.label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.summary}</p>
      </TableCell>
      <TableCell className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
        {item.summary.match(/₹[\d,]+\.?\d*/)?.[0] ?? '—'}
      </TableCell>
      <TableCell>
        <Link to={item.url as '/'}>
          <Button size="sm" variant="outline">
            View <ArrowRight size={12} />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
