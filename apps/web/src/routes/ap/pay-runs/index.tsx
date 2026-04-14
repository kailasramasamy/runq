import { useState, useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { IndianRupee, AlertTriangle, Calendar, CalendarDays, Inbox, Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  usePaymentQueue,
  usePaymentRuns,
  useCreateRunFromBills,
} from '../../../hooks/queries/use-payment-runs';
import type { PaymentQueueBill } from '../../../hooks/queries/use-payment-runs';
import type { PaymentRun, PaymentRunStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardContent,
  StatsCard,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableSkeleton,
  EmptyState,
  useToast,
} from '@/components/ui';

type BadgeVariant = 'warning' | 'success' | 'danger' | 'outline' | 'default' | 'cyan' | 'info';

const RUN_STATUS_VARIANT: Record<PaymentRunStatus, BadgeVariant> = {
  pending_approval: 'warning',
  partially_approved: 'cyan',
  approved: 'success',
  rejected: 'danger',
  executed: 'info',
};

const RUN_STATUS_LABEL: Record<PaymentRunStatus, string> = {
  pending_approval: 'Pending Approval',
  partially_approved: 'Partially Approved',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

type QueueFilter = 'all' | 'overdue' | 'due-this-week' | 'due-this-month';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-this-week', label: 'Due This Week' },
  { value: 'due-this-month', label: 'Due This Month' },
];

// ─── Payment Queue ───────────────────────────────────────────────────────────

function PaymentQueue() {
  const { data, isLoading } = usePaymentQueue();
  const createRun = useCreateRunFromBills();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');

  const summary = data?.data?.summary;
  const allBills = data?.data?.bills ?? [];

  const bills = useMemo(() => {
    let filtered = allBills;
    const today = new Date().toISOString().split('T')[0]!;
    const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]!;
    const monthEnd = new Date(today.slice(0, 7) + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    const monthEndStr = monthEnd.toISOString().split('T')[0]!;

    if (filter === 'overdue') filtered = filtered.filter((b) => b.dueDate < today);
    else if (filter === 'due-this-week') filtered = filtered.filter((b) => b.dueDate >= today && b.dueDate <= weekEnd);
    else if (filter === 'due-this-month') filtered = filtered.filter((b) => b.dueDate >= today && b.dueDate <= monthEndStr);

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (b) => b.invoiceNumber.toLowerCase().includes(q) || b.vendorName.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [allBills, filter, search]);

  function toggleAll() {
    if (selected.size === bills.length) setSelected(new Set());
    else setSelected(new Set(bills.map((b) => b.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleCreateRun() {
    createRun.mutate(
      { billIds: Array.from(selected) },
      {
        onSuccess: (res) => {
          toast('Pay run created.', 'success');
          setSelected(new Set());
          navigate({ to: '/ap/pay-runs/$runId', params: { runId: res.data.id } });
        },
        onError: () => toast('Failed to create pay run.', 'error'),
      },
    );
  }

  const selectedTotal = bills.filter((b) => selected.has(b.id)).reduce((s, b) => s + b.balanceDue, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard title="Total Payable" value={summary.totalPayable} icon={IndianRupee} />
          <StatsCard
            title="Overdue"
            value={summary.overdueAmount}
            icon={AlertTriangle}
            className="border-red-200 dark:border-red-900/50"
            formatValue={(v) => `${formatINR(v)} (${summary.overdueCount})`}
            onClick={() => setFilter('overdue')}
          />
          <StatsCard title="Due This Week" value={summary.dueThisWeek} icon={Calendar} onClick={() => setFilter('due-this-week')} />
          <StatsCard title="Due This Month" value={summary.dueThisMonth} icon={CalendarDays} onClick={() => setFilter('due-this-month')} />
        </div>
      ) : null}

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative sm:w-64">
            <input
              type="text"
              placeholder="Search by invoice # or vendor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
          <div className="sm:w-48">
            <Select
              label="Filter"
              options={FILTER_OPTIONS}
              value={filter}
              onChange={(e) => setFilter(e.target.value as QueueFilter)}
            />
          </div>
          {selected.size > 0 && (
            <Button onClick={handleCreateRun} loading={createRun.isPending}>
              Pay Selected ({selected.size}) — {formatINR(selectedTotal)}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : bills.length === 0 ? (
          <EmptyState icon={Inbox} title="No pending bills" description="All approved bills have been paid." />
        ) : (
          bills.map((bill) => (
            <QueueCard key={bill.id} bill={bill} selected={selected} toggleOne={toggleOne} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === bills.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 bg-white text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:bg-indigo-600"
                />
              </Th>
              <Th>Vendor</Th>
              <Th>Invoice #</Th>
              <Th>Due Date</Th>
              <Th align="right">Overdue</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Balance Due</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={Inbox} title="No pending bills" description="All approved bills have been paid." />
                </td>
              </tr>
            ) : (
              bills.map((bill) => (
                <TableRow key={bill.id} className={selected.has(bill.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(bill.id)}
                      onChange={() => toggleOne(bill.id)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:bg-indigo-600"
                    />
                  </TableCell>
                  <TableCell className="text-zinc-700 dark:text-zinc-300">{bill.vendorName}</TableCell>
                  <TableCell className="font-mono text-xs">{bill.invoiceNumber}</TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">{bill.dueDate}</TableCell>
                  <TableCell align="right" numeric>
                    {bill.daysOverdue > 0 ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">{bill.daysOverdue}d</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right" numeric>{formatINR(bill.totalAmount)}</TableCell>
                  <TableCell align="right" numeric className="font-medium">{formatINR(bill.balanceDue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function QueueCard({ bill, selected, toggleOne }: { bill: PaymentQueueBill; selected: Set<string>; toggleOne: (id: string) => void }) {
  const isSelected = selected.has(bill.id);
  return (
    <div
      className={[
        'rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900',
        isSelected ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-900/10' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleOne(bill.id)}
            className="h-4 w-4 rounded border-zinc-300 bg-white text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:bg-indigo-600"
          />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{bill.vendorName}</span>
        </div>
        {bill.daysOverdue > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {bill.daysOverdue}d overdue
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-mono">{bill.invoiceNumber}</span>
        <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">{formatINR(bill.balanceDue)}</span>
      </div>
      <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Due: {bill.dueDate}</div>
    </div>
  );
}

// ─── Past Pay Runs ───────────────────────────────────────────────────────────

function PastPayRuns() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = usePaymentRuns();
  const navigate = useNavigate();

  const runs = data?.data ?? [];
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
      >
        <ChevronRight size={16} />
        Past Pay Runs {runs.length > 0 && `(${runs.length})`}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        <ChevronDown size={16} />
        Past Pay Runs
      </button>

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
      ) : runs.length === 0 ? (
        <p className="text-sm text-zinc-400">No pay runs created yet.</p>
      ) : (
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <tr>
                <Th>Run ID</Th>
                <Th>Source</Th>
                <Th align="right">Count</Th>
                <Th align="right">Total</Th>
                <Th align="right">Approved</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: '/ap/pay-runs/$runId', params: { runId: r.id } })}
                >
                  <TableCell className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{r.runId}</TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{r.source}</TableCell>
                  <TableCell align="right" numeric>{r.totalCount}</TableCell>
                  <TableCell align="right" numeric>{formatINR(r.totalAmount)}</TableCell>
                  <TableCell align="right" numeric>
                    {r.approvedCount > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">{formatINR(r.approvedAmount)}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={RUN_STATUS_VARIANT[r.status]}>{RUN_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(r.createdAt).toLocaleDateString('en-IN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        {runs.map((r) => (
          <div
            key={r.id}
            className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
            onClick={() => navigate({ to: '/ap/pay-runs/$runId', params: { runId: r.id } })}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{r.runId}</span>
              <Badge variant={RUN_STATUS_VARIANT[r.status]}>{RUN_STATUS_LABEL[r.status]}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
              <span>{r.totalCount} items</span>
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{formatINR(r.totalAmount)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PayRunsListPage() {
  return (
    <div>
      <PageHeader
        title="Payment Queue"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Payment Queue' }]}
      />
      <PaymentQueue />
      <div className="mt-8">
        <PastPayRuns />
      </div>
    </div>
  );
}
