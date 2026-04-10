import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FileText, Search, Download, Upload, Send, X as XIcon } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useInvoices, useBatchUpdateStatus } from '@/hooks/queries/use-invoices';
import { useCustomers } from '@/hooks/queries/use-customers';
import { formatINR } from '@/lib/utils';
import type { SalesInvoiceWithDetails, SalesInvoiceStatus } from '@runq/types';
import {
  PageHeader, Badge, Button, Select, DateInput, Combobox,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  TableSkeleton, EmptyState, Pagination, useToast,
} from '@/components/ui';

const LIMIT = 20;

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'cyan';

const STATUS_BADGE: Record<SalesInvoiceStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  sent: { variant: 'info', label: 'Sent' },
  partially_paid: { variant: 'cyan', label: 'Partial' },
  paid: { variant: 'success', label: 'Paid' },
  overdue: { variant: 'danger', label: 'Overdue' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

function InvoiceCard({
  invoice,
  onView,
}: {
  invoice: SalesInvoiceWithDetails;
  onView: (id: string) => void;
}) {
  const statusInfo = STATUS_BADGE[invoice.status];
  return (
    <div
      className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
      onClick={() => onView(invoice.id)}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{invoice.invoiceNumber}</span>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>
      <div className="mt-1 flex items-center gap-2">
        {invoice.customerNickname && (
          <span className="shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400">{invoice.customerNickname}</span>
        )}
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{invoice.customerName}</span>
      </div>
      <div className="mt-1 flex items-center text-xs text-zinc-500 dark:text-zinc-400">
        <span>{invoice.invoiceDate}</span>
        <span className="ml-auto font-mono text-zinc-900 dark:text-zinc-100">{formatINR(invoice.balanceDue)}</span>
      </div>
    </div>
  );
}

function InvoiceRow({
  invoice,
  onView,
  selected,
  onToggleSelect,
}: {
  invoice: SalesInvoiceWithDetails;
  onView: (id: string) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const statusInfo = STATUS_BADGE[invoice.status];
  return (
    <TableRow className="cursor-pointer" onClick={() => onView(invoice.id)}>
      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(invoice.id)}
          className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
        />
      </TableCell>
      <TableCell className="font-mono text-sm font-medium">{invoice.invoiceNumber}</TableCell>
      <TableCell className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        {invoice.customerNickname ?? ''}
      </TableCell>
      <TableCell>{invoice.customerName}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{invoice.invoiceDate}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{invoice.dueDate}</TableCell>
      <TableCell align="right" numeric className="font-mono text-sm">{formatINR(invoice.totalAmount)}</TableCell>
      <TableCell align="right" numeric className="font-mono text-sm">{formatINR(invoice.amountReceived)}</TableCell>
      <TableCell align="right" numeric className="font-mono text-sm">{formatINR(invoice.balanceDue)}</TableCell>
      <TableCell>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
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
      const allOnPage = invoices.map((i) => i.id);
      const allSelected = allOnPage.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        allOnPage.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...allOnPage]);
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

  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data ?? [];
  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const { data, isLoading } = useInvoices({
    customerId: customerFilter || undefined,
    status: statusFilter as SalesInvoiceStatus | undefined || undefined,
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

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Invoices' }]}
        title="Invoices"
        description="Track sales invoices, payments, and outstanding balances."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('invoices.csv', ['Invoice #', 'Date', 'Due Date', 'Customer', 'Amount', 'Received', 'Balance', 'Status'], invoices.map(inv => [inv.invoiceNumber, inv.invoiceDate, inv.dueDate, inv.customerName, inv.totalAmount, inv.amountReceived, inv.balanceDue, inv.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/ar/invoices/import' })}>
              <Upload size={16} />
              Import
            </Button>
            <Button onClick={() => navigate({ to: '/ar/invoices/new' })}>
              <Plus size={16} />
              New Invoice
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search invoice #, customer..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="block w-full rounded-md border border-zinc-300 bg-white py-2 pl-8 pr-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-indigo-400"
          />
        </div>
        <div className="sm:w-52">
          <Combobox
            options={customerOptions}
            value={customerFilter}
            onChange={(v) => { setCustomerFilter(v); setPage(1); }}
            placeholder="All Customers"
          />
        </div>
        <div className="sm:w-44">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          />
        </div>
        <div className="sm:w-40">
          <DateInput
            placeholder="From date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="sm:w-40">
          <DateInput
            placeholder="To date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/30">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => handleBatchStatus('sent')}
            loading={batchMutation.isPending}
          >
            <Send size={14} /> Mark as Sent
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBatchStatus('cancelled')}
            loading={batchMutation.isPending}
          >
            Cancel Selected
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="Clear selection"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* Mobile card view */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={statusFilter || customerFilter ? 'No invoices match your filters' : 'No invoices yet'}
            description={
              statusFilter || customerFilter
                ? 'Try adjusting your filters.'
                : 'Create your first invoice to get started.'
            }
            action={
              !statusFilter && !customerFilter ? (
                <Button size="sm" onClick={() => navigate({ to: '/ar/invoices/new' })}>
                  <Plus size={14} /> New Invoice
                </Button>
              ) : undefined
            }
            helpHref={!statusFilter && !customerFilter ? '/help/recipes/03-create-invoice' : undefined}
          />
        ) : (
          invoices.map((inv) => (
            <InvoiceCard key={inv.id} invoice={inv} onView={handleView} />
          ))
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  checked={invoices.length > 0 && invoices.every((i) => selected.has(i.id))}
                  onChange={() => toggleSelectAll(invoices)}
                  className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </Th>
              <Th>Invoice #</Th>
              <Th>Nickname</Th>
              <Th>Customer</Th>
              <Th>Date</Th>
              <Th>Due Date</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Received</Th>
              <Th align="right">Balance</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={10} />
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    icon={FileText}
                    title={statusFilter || customerFilter ? 'No invoices match your filters' : 'No invoices yet'}
                    description={
                      statusFilter || customerFilter
                        ? 'Try adjusting your filters.'
                        : 'Create your first invoice to get started.'
                    }
                    action={
                      !statusFilter && !customerFilter ? (
                        <Button size="sm" onClick={() => navigate({ to: '/ar/invoices/new' })}>
                          <Plus size={14} /> New Invoice
                        </Button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  onView={handleView}
                  selected={selected.has(inv.id)}
                  onToggleSelect={toggleSelect}
                />
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
    </div>
  );
}
