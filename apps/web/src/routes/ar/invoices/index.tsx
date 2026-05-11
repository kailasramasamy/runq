import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, FileText, Search, Download, Upload, Send, X as XIcon, CheckCircle2 } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { api } from '@/lib/api-client';
import { useInvoices, useInvoiceSummary, useBatchUpdateStatus } from '@/hooks/queries/use-invoices';
import type { PaginatedResponse, SalesInvoiceWithDetails, SalesInvoiceStatus } from '@runq/types';
import { useCustomers } from '@/hooks/queries/use-customers';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Input, Select, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate, daysBetween,
} from '@/components/ar/primitives';
import { NewInvoiceMenu } from '@/components/ar/new-invoice-menu';
import { Combobox, DateRangeFilter, useToast } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

const LIMIT = 25;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'unpaid', label: 'Unpaid (Pending)' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const readOnly = useIsReadOnly();
  const params = useSearch({ strict: false }) as {
    customer?: string;
    status?: SalesInvoiceStatus;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
  };
  const search = params.q ?? '';
  const customerFilter = params.customer ?? '';
  const statusFilter = params.status ?? '';
  const dateFrom = params.from ?? '';
  const dateTo = params.to ?? '';
  const page = params.page ?? 1;

  function updateSearch(patch: Partial<typeof params>, resetPage = true) {
    navigate({
      to: '/ar/invoices',
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
  const setSearch = (v: string) => updateSearch({ q: v || undefined });
  const setCustomerFilter = (v: string) => updateSearch({ customer: v || undefined });
  const setStatusFilter = (v: string) => updateSearch({ status: (v || undefined) as SalesInvoiceStatus | undefined });
  const setDateRange = (r: { from: string; to: string }) =>
    updateSearch({ from: r.from || undefined, to: r.to || undefined });
  const setPage = (p: number) => updateSearch({ page: p > 1 ? p : undefined }, false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const batchMutation = useBatchUpdateStatus();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(invoices: SalesInvoiceWithDetails[]) {
    setSelected((prev) => {
      const ids = invoices.map((i) => i.id);
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function handleBatchStatus(status: 'sent' | 'cancelled') {
    if (selected.size === 0) return;
    try {
      const res = await batchMutation.mutateAsync({ invoiceIds: [...selected], status });
      const { updated, skipped } = res.data;
      toast(
        `${updated} invoice${updated === 1 ? '' : 's'} marked as ${status}` +
          (skipped.length > 0 ? ` · ${skipped.length} skipped (not draft)` : ''),
        skipped.length > 0 ? 'info' : 'success',
      );
      setSelected(new Set());
    } catch (err) {
      toast((err as Error).message || 'Batch update failed', 'error');
    }
  }

  const { data: summaryData } = useInvoiceSummary({
    customerId: customerFilter || undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data ?? [];
  const customerOptions = [
    { value: '', label: 'All customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const { data, isLoading } = useInvoices({
    customerId: customerFilter || undefined,
    status: (statusFilter || undefined) as SalesInvoiceStatus | undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: LIMIT,
  });

  const invoices = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  function handleView(id: string) {
    navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId: id } });
  }

  async function handleExportCSV() {
    try {
      const exportParams = new URLSearchParams();
      if (customerFilter) exportParams.set('customerId', customerFilter);
      if (statusFilter) exportParams.set('status', statusFilter);
      if (search) exportParams.set('search', search);
      if (dateFrom) exportParams.set('dateFrom', dateFrom);
      if (dateTo) exportParams.set('dateTo', dateTo);
      exportParams.set('limit', '10000');
      const qs = exportParams.toString();
      const res = await api.get<PaginatedResponse<SalesInvoiceWithDetails>>(
        `/ar/invoices${qs ? `?${qs}` : ''}`,
      );
      const all = res.data;
      downloadCSV(
        'invoices.csv',
        ['Invoice #', 'Nickname', 'Customer', 'Date', 'Due Date', 'PO #', 'Amount', 'Received', 'Balance', 'Status'],
        all.map((inv) => [
          inv.invoiceNumber, inv.customerNickname ?? '', inv.customerName,
          inv.invoiceDate, inv.dueDate, inv.poNumber ?? '',
          inv.totalAmount, inv.amountReceived, inv.balanceDue, inv.status,
        ]),
      );
      toast(`Exported ${all.length} invoices`, 'success');
    } catch {
      toast('Export failed', 'error');
    }
  }

  const summary = summaryData?.data;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Invoices' }]}
        title="Invoices"
        description="Sales invoices and e-Invoice status across all customers."
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={handleExportCSV}>
              Export
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/ar/invoices/import' })}>
                  Import
                </Button>
                <NewInvoiceMenu>
                  {(open) => (
                    <Button size="sm" icon={<Plus size={13} />} onClick={open}>
                      New invoice
                    </Button>
                  )}
                </NewInvoiceMenu>
              </>
            )}
          </>
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={summary ? formatINRShort(summary.totalOutstanding) : '—'}
          sub={summary ? `${summary.pendingCount} open invoices` : undefined}
        />
        <StatTile
          label="Overdue"
          value={summary ? formatINRShort(summary.overdueAmount) : '—'}
          sub={summary ? `${summary.overdueCount} invoice${summary.overdueCount === 1 ? '' : 's'}` : undefined}
          tone="neg"
        />
        <StatTile
          label="Drafts"
          value={summary?.draftCount ?? '—'}
          sub="Awaiting send"
          tone="warn"
        />
        <StatTile
          label="Received"
          value={summary ? formatINRShort(summary.totalReceived) : '—'}
          sub="Cleared invoices"
          tone="pos"
        />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search invoice # or customer…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        />
        <div className="w-80">
          <Combobox
            options={customerOptions}
            value={customerFilter}
            onChange={(v) => { setCustomerFilter(v); setPage(1); }}
            placeholder="All customers"
          />
        </div>
        <DateRangeFilter
          value={{ from: dateFrom, to: dateTo }}
          onChange={(r) => { setDateRange(r); setPage(1); }}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} invoices</span>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div
          className="mb-3 flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]"
          style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 30%, transparent)', color: 'var(--accent-text)' }}
        >
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" icon={<Send size={13} />} loading={batchMutation.isPending} onClick={() => handleBatchStatus('sent')}>
            Mark as sent
          </Button>
          <Button size="sm" variant="outline" loading={batchMutation.isPending} onClick={() => handleBatchStatus('cancelled')}>
            Cancel selected
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
                checked={invoices.length > 0 && invoices.every((i) => selected.has(i.id))}
                onChange={() => toggleSelectAll(invoices)}
                aria-label="Select all on page"
              />
            </Th>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Issued</Th>
            <Th>Due</Th>
            <Th align="right">Total</Th>
            <Th align="right">Balance</Th>
            <Th>Status</Th>
            <Th>e-Inv</Th>
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
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={<FileText size={18} />}
                  title={statusFilter || customerFilter ? 'No invoices match your filters' : 'No invoices yet'}
                  description={statusFilter || customerFilter ? 'Try adjusting your filters.' : 'Create your first invoice to get started.'}
                  action={!statusFilter && !customerFilter && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ar/invoices/new' })}>
                      New invoice
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : invoices.map((inv) => {
            const overdueDays = inv.status === 'overdue' ? daysBetween(inv.dueDate) : null;
            const hasEinvoice = !!inv.irnNumber;
            return (
              <TableRow key={inv.id} onClick={() => handleView(inv.id)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                    aria-label={`Select ${inv.invoiceNumber}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    {inv.invoiceNumber}
                  </div>
                  {inv.poNumber && (
                    <div className="num text-[10.5px]" style={{ color: 'var(--text-3)' }}>{inv.poNumber}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium" style={{ color: 'var(--text-1)' }}>{inv.customerName}</div>
                  {inv.customerNickname && (
                    <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>{inv.customerNickname}</div>
                  )}
                </TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(inv.invoiceDate)}</TableCell>
                <TableCell>
                  <div className="num text-[12.5px]" style={{ color: 'var(--text-2)' }}>{formatDate(inv.dueDate)}</div>
                  {overdueDays !== null && overdueDays > 0 && (
                    <div className="num text-[10.5px] font-medium" style={{ color: 'var(--neg)' }}>
                      {overdueDays}d overdue
                    </div>
                  )}
                </TableCell>
                <TableCell align="right" numeric>{formatINR(inv.totalAmount)}</TableCell>
                <TableCell align="right" numeric className="font-semibold">
                  {inv.balanceDue > 0 ? formatINR(inv.balanceDue) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                </TableCell>
                <TableCell><StatusBadge status={inv.status} /></TableCell>
                <TableCell>
                  {hasEinvoice ? (
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-2)' }} title={`IRN: ${inv.irnNumber}`}>
                      <CheckCircle2 size={12} style={{ color: 'var(--pos)' }} />
                      <span className="num text-[10.5px]">
                        {inv.irnNumber!.slice(0, 4)}…{inv.irnNumber!.slice(-4)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>—</span>
                  )}
                </TableCell>
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
    </div>
  );
}
