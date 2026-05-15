import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Inbox, Search, ChevronDown, ChevronRight, Send, X as XIcon } from 'lucide-react';
import {
  usePaymentQueue, usePaymentRuns, useCreateRunFromBills,
} from '@/hooks/queries/use-payment-runs';
import type { PaymentQueueBill } from '@/hooks/queries/use-payment-runs';
import type { PaymentRunStatus } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Input, Select, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useToast } from '@/components/ui';

type QueueFilter = 'all' | 'overdue' | 'due-this-week' | 'due-this-month';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-this-week', label: 'Due this week' },
  { value: 'due-this-month', label: 'Due this month' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'service_provider', label: 'Service provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'internal_transfer', label: 'Internal transfer' },
  { value: 'other', label: 'Other' },
];

const RUN_STATUS_LABEL: Record<PaymentRunStatus, string> = {
  pending_approval: 'Pending approval',
  partially_approved: 'Partially approved',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

export function PayRunsListPage() {
  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Pay runs' }]}
        title="Payment queue"
        description="Approve overdue and upcoming bills as a batch — single click to schedule a pay run."
      />
      <PaymentQueue />
      <div className="mt-8">
        <PastPayRuns />
      </div>
    </div>
  );
}

function PaymentQueue() {
  const { data, isLoading } = usePaymentQueue();
  const createRun = useCreateRunFromBills();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [category, setCategory] = useState('');

  const allBills = data?.data?.bills ?? [];

  const { bills, filteredSummary } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!;
    const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]!;
    const monthEnd = new Date(today.slice(0, 7) + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    const monthEndStr = monthEnd.toISOString().split('T')[0]!;

    let base = allBills;
    if (category) base = base.filter((b) => b.vendorCategory === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (b) => b.invoiceNumber.toLowerCase().includes(q) || b.vendorName.toLowerCase().includes(q),
      );
    }

    let totalPayable = 0, overdueAmount = 0, overdueCount = 0, dueThisWeek = 0, dueThisMonth = 0;
    for (const b of base) {
      totalPayable += b.balanceDue;
      if (b.dueDate < today) { overdueAmount += b.balanceDue; overdueCount++; }
      if (b.dueDate >= today && b.dueDate <= weekEnd) dueThisWeek += b.balanceDue;
      if (b.dueDate >= today && b.dueDate <= monthEndStr) dueThisMonth += b.balanceDue;
    }

    let filtered = base;
    if (filter === 'overdue') filtered = filtered.filter((b) => b.dueDate < today);
    else if (filter === 'due-this-week') filtered = filtered.filter((b) => b.dueDate >= today && b.dueDate <= weekEnd);
    else if (filter === 'due-this-month') filtered = filtered.filter((b) => b.dueDate >= today && b.dueDate <= monthEndStr);

    return {
      bills: filtered,
      filteredSummary: { totalPayable, overdueAmount, overdueCount, dueThisWeek, dueThisMonth },
    };
  }, [allBills, filter, category, search]);

  function toggleAll() {
    if (selected.size === bills.length) setSelected(new Set());
    else setSelected(new Set(bills.map((b) => b.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
          navigate({ to: '/finance/ap/pay-runs/$runId', params: { runId: res.data.id } });
        },
        onError: () => toast('Failed to create pay run.', 'error'),
      },
    );
  }

  const selectedTotal = bills.filter((b) => selected.has(b.id)).reduce((s, b) => s + b.balanceDue, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total payable"
          value={formatINRShort(filteredSummary.totalPayable)}
          sub={`${allBills.length} bill${allBills.length === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Overdue"
          value={formatINRShort(filteredSummary.overdueAmount)}
          sub={`${filteredSummary.overdueCount} bill${filteredSummary.overdueCount === 1 ? '' : 's'}`}
          tone="neg"
        />
        <StatTile label="Due this week" value={formatINRShort(filteredSummary.dueThisWeek)} sub="7-day window" tone="warn" />
        <StatTile label="Due this month" value={formatINRShort(filteredSummary.dueThisMonth)} sub="Calendar month" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search invoice # or vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(e) => setFilter(e.target.value as QueueFilter)}
        />
        <Select
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{bills.length} eligible</span>
      </div>

      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]"
          style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 30%, transparent)', color: 'var(--accent-text)' }}
        >
          <span className="font-medium">
            {selected.size} selected · <span className="num">{formatINR(selectedTotal)}</span>
          </span>
          <Button size="sm" icon={<Send size={13} />} loading={createRun.isPending} onClick={handleCreateRun}>
            Create pay run
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded p-1 hover:bg-black/5"
            title="Clear selection"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>
              <input
                type="checkbox"
                checked={bills.length > 0 && selected.size === bills.length}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </Th>
            <Th>Vendor</Th>
            <Th>Bill #</Th>
            <Th>Due</Th>
            <Th align="right">Overdue</Th>
            <Th align="right">Total</Th>
            <Th align="right">Balance</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : bills.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<Inbox size={18} />}
                  title="No pending bills"
                  description="All approved bills have been paid."
                />
              </td>
            </tr>
          ) : bills.map((bill: PaymentQueueBill) => (
            <TableRow key={bill.id}>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(bill.id)}
                  onChange={() => toggleOne(bill.id)}
                  aria-label={`Select ${bill.invoiceNumber}`}
                />
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{bill.vendorName}</span>
              </TableCell>
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {bill.invoiceNumber}
                </span>
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(bill.dueDate)}</TableCell>
              <TableCell align="right" numeric>
                {bill.daysOverdue > 0 ? (
                  <span className="font-semibold" style={{ color: 'var(--neg)' }}>{bill.daysOverdue}d</span>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>—</span>
                )}
              </TableCell>
              <TableCell align="right" numeric>{formatINR(bill.totalAmount)}</TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(bill.balanceDue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PastPayRuns() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = usePaymentRuns();
  const navigate = useNavigate();

  const runs = data?.data ?? [];

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-[12.5px]"
        style={{ color: 'var(--text-2)' }}
      >
        <ChevronRight size={14} />
        Past pay runs {runs.length > 0 && <span className="num" style={{ color: 'var(--text-3)' }}>({runs.length})</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-2 text-[13px] font-medium"
        style={{ color: 'var(--text-1)' }}
      >
        <ChevronDown size={14} />
        Past pay runs
      </button>

      {isLoading ? (
        <div
          className="h-24 animate-pulse rounded-xl border"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        />
      ) : runs.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>No pay runs created yet.</p>
      ) : (
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
                onClick={() => navigate({ to: '/finance/ap/pay-runs/$runId', params: { runId: r.id } })}
              >
                <TableCell>
                  <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>{r.runId}</span>
                </TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>{r.source}</TableCell>
                <TableCell align="right" numeric>{r.totalCount}</TableCell>
                <TableCell align="right" numeric>{formatINR(r.totalAmount)}</TableCell>
                <TableCell align="right" numeric>
                  {r.approvedCount > 0 ? (
                    <span style={{ color: 'var(--pos)' }}>{formatINR(r.approvedAmount)}</span>
                  ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                  <span className="ml-1.5 hidden text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                    {RUN_STATUS_LABEL[r.status]}
                  </span>
                </TableCell>
                <TableCell numeric style={{ color: 'var(--text-3)' }}>
                  {new Date(r.createdAt).toLocaleDateString('en-IN')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
