import { useState, useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, FileText, Download, Upload, Send, Search, ScanLine, X as XIcon, Check } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { usePurchaseInvoices, useDeletePurchaseInvoice, useBulkApproveInvoices } from '@/hooks/queries/use-purchase-invoices';
import { useVendors, useVendorTags } from '@/hooks/queries/use-vendors';
import { useCreateRunFromBills } from '@/hooks/queries/use-payment-runs';
import type { PurchaseInvoice, PurchaseInvoiceStatus } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Input, Select, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate, daysBetween,
} from '@/components/ar/primitives';
import { Combobox, ConfirmationDialog, DateRangeFilter, useToast } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

const LIMIT = 25;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_match', label: 'Pending match' },
  { value: 'matched', label: 'Matched' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'service_provider', label: 'Service provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

function isEligibleForPayRun(bill: PurchaseInvoice): boolean {
  return (bill.status === 'approved' || bill.status === 'partially_paid') && Number(bill.balanceDue) > 0;
}

function isApprovable(bill: PurchaseInvoice): boolean {
  return bill.status === 'draft' || bill.status === 'matched';
}

function isSelectable(bill: PurchaseInvoice): boolean {
  return isEligibleForPayRun(bill) || isApprovable(bill);
}

export function BillListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const readOnly = useIsReadOnly();
  const params = useSearch({ strict: false }) as {
    vendor?: string;
    status?: PurchaseInvoiceStatus;
    category?: string;
    tag?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
  };
  const vendorId = params.vendor ?? '';
  const status = params.status ?? '';
  const category = params.category ?? '';
  const tag = params.tag ?? '';
  const search = params.q ?? '';
  const dateFrom = params.from ?? '';
  const dateTo = params.to ?? '';
  const page = params.page ?? 1;

  function updateSearch(patch: Partial<typeof params>, resetPage = true): void {
    navigate({
      to: '/ap/bills',
      search: (prev) => {
        const next = { ...(prev as typeof params), ...patch };
        if (resetPage) next.page = undefined;
        for (const k of Object.keys(next) as (keyof typeof next)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }
  const setVendorId = (v: string) => updateSearch({ vendor: v || undefined });
  const setStatus = (v: string) => updateSearch({ status: (v || undefined) as PurchaseInvoiceStatus | undefined });
  const setCategory = (v: string) => updateSearch({ category: v || undefined });
  const setTag = (v: string) => updateSearch({ tag: v || undefined });
  const setSearch = (v: string) => updateSearch({ q: v || undefined });
  const setDateRange = (r: { from: string; to: string }) =>
    updateSearch({ from: r.from || undefined, to: r.to || undefined });
  const setPage = (p: number) => updateSearch({ page: p > 1 ? p : undefined }, false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const bulkApprove = useBulkApproveInvoices();

  const filters = {
    vendorId: vendorId || undefined,
    status: (status || undefined) as PurchaseInvoiceStatus | undefined,
    vendorCategory: category || undefined,
    vendorTag: tag || undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, isLoading } = usePurchaseInvoices(filters, page, LIMIT);
  const { data: vendorsData } = useVendors({ limit: 100 });
  const { data: tagsData } = useVendorTags();
  const deleteMutation = useDeletePurchaseInvoice();
  const createRunFromBills = useCreateRunFromBills();

  const bills = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const vendors = vendorsData?.data ?? [];
  const hasFilters = !!(vendorId || status || category || tag || search || dateFrom || dateTo);

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
    { value: '', label: 'All vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];
  const tagOptions = [
    { value: '', label: 'All tags' },
    ...((tagsData?.data ?? []).map((t) => ({ value: t, label: t }))),
  ];

  const selectableBills = useMemo(() => bills.filter(isSelectable), [bills]);
  const selectedBills = useMemo(
    () => selectableBills.filter((b) => selectedIds.includes(b.id)),
    [selectableBills, selectedIds],
  );
  const selectedTotal = selectedBills.reduce((s, b) => s + Number(b.balanceDue), 0);
  const allSelectableSelected = selectableBills.length > 0 && selectedBills.length === selectableBills.length;

  // Action eligibility — only matters for the bulk action buttons.
  const selectedApprovable = selectedBills.filter(isApprovable);
  const selectedPayable = selectedBills.filter(isEligibleForPayRun);

  function toggleOne(id: string, shiftKey: boolean) {
    setSelectedIds((prev) => {
      // Shift-click range: extend selection from last-clicked to this row,
      // taking only currently-selectable bills in that range.
      if (shiftKey && lastClickedId && lastClickedId !== id) {
        const startIdx = selectableBills.findIndex((b) => b.id === lastClickedId);
        const endIdx = selectableBills.findIndex((b) => b.id === id);
        if (startIdx >= 0 && endIdx >= 0) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const rangeIds = selectableBills.slice(lo, hi + 1).map((b) => b.id);
          // If the anchor was selected, the range adds; otherwise it removes.
          const adding = prev.includes(lastClickedId);
          const set = new Set(prev);
          rangeIds.forEach((rid) => { if (adding) set.add(rid); else set.delete(rid); });
          return Array.from(set);
        }
      }
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next;
    });
    setLastClickedId(id);
  }
  function toggleAllSelectable() {
    setSelectedIds((prev) => prev.length === selectableBills.length ? [] : selectableBills.map((b) => b.id));
    setLastClickedId(null);
  }
  function handleAddToPayRun() {
    if (selectedPayable.length === 0) return;
    const ids = selectedPayable.map((b) => b.id);
    createRunFromBills.mutate(
      { billIds: ids },
      {
        onSuccess: (res) => {
          const run = (res as { data: { id: string; runId: string } }).data;
          toast(`Created pay run ${run.runId} with ${ids.length} bill(s)`, 'success');
          setSelectedIds([]);
          navigate({ to: '/ap/pay-runs/$runId', params: { runId: run.id } });
        },
        onError: () => toast('Failed to create pay run', 'error'),
      },
    );
  }
  function handleBulkApprove() {
    if (selectedApprovable.length === 0) return;
    const ids = selectedApprovable.map((b) => b.id);
    bulkApprove.mutate(ids, {
      onSuccess: ({ succeeded, failed }) => {
        if (failed.length === 0) {
          toast(`Approved ${succeeded.length} bill${succeeded.length === 1 ? '' : 's'}`, 'success');
        } else if (succeeded.length === 0) {
          toast(`All ${failed.length} approval${failed.length === 1 ? '' : 's'} failed: ${failed[0]!.reason}`, 'error');
        } else {
          toast(`Approved ${succeeded.length}, ${failed.length} failed (e.g. ${failed[0]!.reason})`, 'info');
        }
        setSelectedIds(selectedIds.filter((id) => !succeeded.includes(id)));
      },
      onError: () => toast('Bulk approve failed', 'error'),
    });
  }
  function handleRowClick(bill: PurchaseInvoice) {
    navigate({ to: '/ap/bills/$billId', params: { billId: bill.id } });
  }

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Bills' }]}
        title="Bills"
        description="Vendor bills, GRN match status, and payment scheduling."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'bills.csv',
                  ['Invoice #', 'Date', 'Vendor', 'Amount', 'Balance', 'Status'],
                  bills.map((b) => [
                    b.invoiceNumber, b.invoiceDate,
                    (b as PurchaseInvoice & { vendorName?: string }).vendorName ?? '',
                    String(b.totalAmount), String(b.balanceDue), b.status,
                  ]),
                )
              }
            >
              Export
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" icon={<ScanLine size={13} />} onClick={() => navigate({ to: '/ap/bills/scan' })}>
                  Scan
                </Button>
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/ap/bills/import' })}>
                  Import
                </Button>
                <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ap/bills/new' })}>
                  New bill
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatINRShort(filteredSummary.totalOutstanding)}
          sub={`${bills.filter((b) => Number(b.balanceDue) > 0 && !['paid','cancelled'].includes(b.status)).length} open bills`}
        />
        <StatTile
          label="Overdue"
          value={formatINRShort(filteredSummary.overdueAmount)}
          sub={`${filteredSummary.overdueCount} bill${filteredSummary.overdueCount === 1 ? '' : 's'}`}
          tone="neg"
        />
        <StatTile
          label="Pending approval"
          value={filteredSummary.pendingApprovalCount}
          sub="Need review"
          tone="warn"
        />
        <StatTile
          label="Paid this month"
          value={formatINRShort(filteredSummary.paidThisMonth)}
          sub="Cleared bills"
          tone="pos"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search invoice # or vendor…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={status}
          options={STATUS_OPTIONS}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        />
        <div className="w-80">
          <Combobox
            options={vendorOptions}
            value={vendorId}
            onChange={(v) => { setVendorId(v); setPage(1); }}
            placeholder="All vendors"
            inputClassName="h-8 py-0 text-[12.5px]"
          />
        </div>
        <Select
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
        />
        <div className="w-56">
          <Combobox
            options={tagOptions}
            value={tag}
            onChange={(v) => { setTag(v); setPage(1); }}
            placeholder="Filter by tag…"
            inputClassName="h-8 py-0 text-[12.5px]"
          />
        </div>
        <DateRangeFilter
          value={{ from: dateFrom, to: dateTo }}
          onChange={(r) => { setDateRange(r); setPage(1); }}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} bills</span>
      </div>

      {selectedIds.length > 0 && (
        <div
          className="mb-3 flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]"
          style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 30%, transparent)', color: 'var(--accent-text)' }}
        >
          <span className="font-medium">
            {selectedIds.length} selected · <span className="num">{formatINR(selectedTotal)}</span>
          </span>
          {selectedApprovable.length > 0 && (
            <Button size="sm" icon={<Check size={13} />} loading={bulkApprove.isPending} onClick={handleBulkApprove}>
              Approve {selectedApprovable.length}
            </Button>
          )}
          {selectedPayable.length > 0 && (
            <Button size="sm" icon={<Send size={13} />} loading={createRunFromBills.isPending} onClick={handleAddToPayRun}>
              Add {selectedPayable.length} to pay run
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
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
              {selectableBills.length > 0 ? (
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={toggleAllSelectable}
                  aria-label="Select all"
                />
              ) : null}
            </Th>
            <Th>Bill #</Th>
            <Th>Vendor</Th>
            <Th>Tags</Th>
            <Th>Issued</Th>
            <Th>Due</Th>
            <Th align="right">Total</Th>
            <Th align="right">Balance</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 9 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : bills.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={<FileText size={18} />}
                  title={hasFilters ? 'No bills match your filters' : 'No bills yet'}
                  description={hasFilters ? 'Try adjusting your filters.' : 'Create your first vendor bill to get started.'}
                  action={!hasFilters && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ap/bills/new' })}>
                      New bill
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : bills.map((bill) => {
            const overdueDays = (Number(bill.balanceDue) > 0 && !['paid','cancelled'].includes(bill.status))
              ? daysBetween(bill.dueDate)
              : 0;
            return (
              <TableRow key={bill.id} onClick={() => handleRowClick(bill)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {isSelectable(bill) ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(bill.id)}
                      onClick={(e) => { e.stopPropagation(); toggleOne(bill.id, e.shiftKey); }}
                      onChange={() => undefined}
                      aria-label={`Select bill ${bill.invoiceNumber}`}
                    />
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    {bill.invoiceNumber}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                    {(bill as PurchaseInvoice & { vendorName?: string }).vendorName ?? '—'}
                  </span>
                </TableCell>
                <TableCell>
                  {(() => {
                    const tags = (bill as PurchaseInvoice & { vendorTags?: string[] }).vendorTags ?? [];
                    if (tags.length === 0) return <span style={{ color: 'var(--text-3)' }}>—</span>;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setTag(t); setPage(1); }}
                            className="rounded px-1.5 py-0.5 text-[10.5px] font-medium hover:underline"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(bill.invoiceDate)}</TableCell>
                <TableCell>
                  <div className="num text-[12.5px]" style={{ color: 'var(--text-2)' }}>{formatDate(bill.dueDate)}</div>
                  {overdueDays > 0 && (
                    <div className="num text-[10.5px] font-medium" style={{ color: 'var(--neg)' }}>
                      {overdueDays}d overdue
                    </div>
                  )}
                </TableCell>
                <TableCell align="right" numeric>{formatINR(Number(bill.totalAmount))}</TableCell>
                <TableCell align="right" numeric className="font-semibold">
                  {Number(bill.balanceDue) > 0
                    ? formatINR(Number(bill.balanceDue))
                    : <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell><StatusBadge status={bill.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
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
