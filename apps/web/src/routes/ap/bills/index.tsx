import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FileText, Download, Send, IndianRupee, AlertTriangle, Clock, CheckCircle, Search } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { usePurchaseInvoices, useDeletePurchaseInvoice } from '../../../hooks/queries/use-purchase-invoices';
import { useVendors } from '../../../hooks/queries/use-vendors';
import { useCreateRunFromBills } from '../../../hooks/queries/use-payment-runs';
import type { PurchaseInvoice, PurchaseInvoiceStatus, MatchStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Button,
  Badge,
  Card,
  CardContent,
  Select,
  DateInput,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableSkeleton,
  EmptyState,
  Pagination,
  ConfirmationDialog,
  StatsCard,
  useToast,
} from '@/components/ui';

// A bill is eligible to be added to a pay run if it's been approved
// (or partially paid) and still has a non-zero balance.
function isEligibleForPayRun(bill: PurchaseInvoice): boolean {
  return (bill.status === 'approved' || bill.status === 'partially_paid') && Number(bill.balanceDue) > 0;
}

const STATUS_BADGE_VARIANT: Record<PurchaseInvoiceStatus, React.ComponentProps<typeof Badge>['variant']> = {
  draft: 'default',
  pending_match: 'warning',
  matched: 'info',
  approved: 'primary',
  partially_paid: 'cyan',
  paid: 'success',
  cancelled: 'outline',
};

const STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = {
  draft: 'Draft',
  pending_match: 'Pending Match',
  matched: 'Matched',
  approved: 'Approved',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const MATCH_BADGE_VARIANT: Record<MatchStatus, React.ComponentProps<typeof Badge>['variant']> = {
  unmatched: 'outline',
  matched: 'success',
  mismatch: 'danger',
};

const ALL_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_match', label: 'Pending Match' },
  { value: 'matched', label: 'Matched' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
  { value: 'other', label: 'Other' },
];

const LIMIT = 20;

export function BillListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filters = {
    vendorId: vendorId || undefined,
    status: (status || undefined) as PurchaseInvoiceStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, isLoading } = usePurchaseInvoices(filters);
  const { data: vendorsData } = useVendors({ limit: 100 });
  const deleteMutation = useDeletePurchaseInvoice();
  const createRunFromBills = useCreateRunFromBills();

  const allBills = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const vendors = vendorsData?.data ?? [];
  const hasFilters = !!(vendorId || status || category || dateFrom || dateTo);

  // Client-side category filter (API handles vendor/status/date filters)
  const bills = useMemo(() => {
    if (!category) return allBills;
    return allBills.filter((b: any) => b.vendorCategory === category);
  }, [allBills, category]);

  // Compute summary from filtered bills
  const filteredSummary = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!;
    const monthStart = today.slice(0, 7) + '-01';
    let totalOutstanding = 0, overdueAmount = 0, overdueCount = 0, pendingApprovalCount = 0, paidThisMonth = 0;
    for (const b of bills) {
      const bal = Number(b.balanceDue);
      if (!['paid', 'cancelled'].includes(b.status)) totalOutstanding += bal;
      if (b.dueDate < today && bal > 0 && !['paid', 'cancelled'].includes(b.status)) { overdueAmount += bal; overdueCount++; }
      if (['draft', 'pending_match', 'matched'].includes(b.status)) pendingApprovalCount++;
      if (['paid', 'partially_paid'].includes(b.status) && b.updatedAt >= monthStart) paidThisMonth += Number(b.amountPaid);
    }
    return { totalOutstanding, overdueAmount, overdueCount, pendingApprovalCount, paidThisMonth };
  }, [bills]);

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Bulk-selection plumbing
  const eligibleBills = useMemo(() => bills.filter(isEligibleForPayRun), [bills]);
  const selectedBills = useMemo(
    () => eligibleBills.filter((b) => selectedIds.includes(b.id)),
    [eligibleBills, selectedIds],
  );
  const selectedTotal = selectedBills.reduce((s, b) => s + Number(b.balanceDue), 0);
  const allEligibleSelected =
    eligibleBills.length > 0 && selectedBills.length === eligibleBills.length;

  function toggleOne(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllEligible() {
    setSelectedIds((prev) =>
      prev.length === eligibleBills.length ? [] : eligibleBills.map((b) => b.id),
    );
  }

  function handleAddToPayRun() {
    if (selectedIds.length === 0) return;
    createRunFromBills.mutate(
      { billIds: selectedIds },
      {
        onSuccess: (res) => {
          const run = (res as { data: { id: string; runId: string } }).data;
          toast(`Created pay run ${run.runId} with ${selectedIds.length} bill(s)`, 'success');
          setSelectedIds([]);
          navigate({ to: '/ap/pay-runs/$runId', params: { runId: run.id } });
        },
        onError: () => toast('Failed to create pay run', 'error'),
      },
    );
  }

  function handleDelete(id: string) {
    setDeleteTarget(id);
  }

  function handleRowClick(bill: PurchaseInvoice) {
    navigate({ to: '/ap/bills/$billId', params: { billId: bill.id } });
  }

  return (
    <div>
      <PageHeader
        title="Bills"
        description="Manage vendor purchase invoices"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Bills' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('bills.csv', ['Invoice #', 'Date', 'Vendor', 'Amount', 'Balance', 'Status'], bills.map(b => [b.invoiceNumber, b.invoiceDate, (b as PurchaseInvoice & { vendorName?: string }).vendorName ?? '', String(b.totalAmount), String(b.balanceDue), STATUS_LABELS[b.status]]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate({ to: '/ap/bills/new' })}
            >
              <Plus size={14} />
              New Bill
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard
            title="Total Outstanding"
            value={filteredSummary.totalOutstanding}
            icon={IndianRupee}
          />
          <StatsCard
            title="Overdue"
            value={filteredSummary.overdueAmount}
            icon={AlertTriangle}
            className="border-red-200 dark:border-red-900/50"
            formatValue={(v) => `${formatINR(v)} (${filteredSummary.overdueCount})`}
          />
          <StatsCard
            title="Pending Approval"
            value={filteredSummary.pendingApprovalCount}
            icon={Clock}
            formatValue={(v) => String(v)}
            onClick={() => { setStatus('draft'); setPage(1); }}
          />
          <StatsCard
            title="Paid This Month"
            value={filteredSummary.paidThisMonth}
            icon={CheckCircle}
          />
        </div>
      )}

      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Select
                label="Vendor"
                options={vendorOptions}
                value={vendorId}
                onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Select
                label="Status"
                options={ALL_STATUSES}
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Select
                label="Category"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              />
            </div>
            <div className="min-w-[140px]">
              <DateInput
                label="From"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div className="min-w-[140px]">
              <DateInput
                label="To"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="mb-4 border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                {selectedIds.length} bill{selectedIds.length === 1 ? '' : 's'} selected
              </span>
              <span className="ml-2 font-mono">{formatINR(selectedTotal)}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
              <Button size="sm" onClick={handleAddToPayRun} loading={createRunFromBills.isPending}>
                <Send size={14} /> Add to pay run
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : bills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? 'No bills match your filters' : 'No bills yet'}
            description={hasFilters ? 'Try adjusting your filters.' : 'Create your first vendor bill to get started.'}
            action={
              !hasFilters ? (
                <Button size="sm" onClick={() => navigate({ to: '/ap/bills/new' })}>
                  <Plus size={14} />
                  New Bill
                </Button>
              ) : undefined
            }
            helpHref={!hasFilters ? '/help/recipes/06-enter-vendor-bill' : undefined}
          />
        ) : (
          bills.map((bill) => (
            <div
              key={bill.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => handleRowClick(bill)}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{bill.invoiceNumber}</span>
                <Badge
                  variant={STATUS_BADGE_VARIANT[bill.status]}
                  className={bill.status === 'cancelled' ? 'line-through' : undefined}
                >
                  {STATUS_LABELS[bill.status]}
                </Badge>
              </div>
              <div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {(bill as PurchaseInvoice & { vendorName?: string }).vendorName ?? '—'}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{bill.invoiceDate}</span>
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 ml-auto">{formatINR(bill.balanceDue)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <tr>
            <Th>
              {eligibleBills.length > 0 ? (
                <input
                  type="checkbox"
                  checked={allEligibleSelected}
                  onChange={toggleAllEligible}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                  aria-label="Select all eligible bills"
                />
              ) : null}
            </Th>
            <Th>Bill #</Th>
            <Th>Vendor</Th>
            <Th>Date</Th>
            <Th>Due Date</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Paid</Th>
            <Th align="right">Balance</Th>
            <Th>Status</Th>
            <Th>Match</Th>
            <Th>Actions</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={6} cols={11} />
          ) : bills.length === 0 ? (
            <tr>
              <td colSpan={11}>
                <EmptyState
                  icon={FileText}
                  title={hasFilters ? 'No bills match your filters' : 'No bills yet'}
                  description={hasFilters ? 'Try adjusting your filters.' : 'Create your first vendor bill to get started.'}
                  action={
                    !hasFilters ? (
                      <Button size="sm" onClick={() => navigate({ to: '/ap/bills/new' })}>
                        <Plus size={14} />
                        New Bill
                      </Button>
                    ) : undefined
                  }
                />
              </td>
            </tr>
          ) : (
            bills.map((bill) => (
              <TableRow
                key={bill.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(bill)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {isEligibleForPayRun(bill) ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(bill.id)}
                      onChange={() => toggleOne(bill.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                      aria-label={`Select bill ${bill.invoiceNumber}`}
                    />
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {bill.invoiceNumber}
                  </span>
                </TableCell>
                <TableCell>
                  {(bill as PurchaseInvoice & { vendorName?: string }).vendorName ?? '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{bill.invoiceDate}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{bill.dueDate}</TableCell>
                <TableCell align="right" numeric>{formatINR(bill.totalAmount)}</TableCell>
                <TableCell align="right" numeric className="text-zinc-500 dark:text-zinc-400">
                  {formatINR(bill.amountPaid)}
                </TableCell>
                <TableCell align="right" numeric>{formatINR(bill.balanceDue)}</TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[bill.status]}
                    className={bill.status === 'cancelled' ? 'line-through' : undefined}
                  >
                    {STATUS_LABELS[bill.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={MATCH_BADGE_VARIANT[bill.matchStatus]}>
                    {bill.matchStatus.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {bill.status === 'draft' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => handleDelete(bill.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </div>
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
          }
        }}
        title="Delete Bill"
        description="Are you sure you want to delete this bill? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
