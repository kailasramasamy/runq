import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FileText } from 'lucide-react';
import { useInvoices } from '@/hooks/queries/use-invoices';
import { useCustomers } from '@/hooks/queries/use-customers';
import { formatINR } from '@/lib/utils';
import type { SalesInvoiceWithDetails, SalesInvoiceStatus } from '@runq/types';
import {
  PageHeader, Badge, Button, Select, DateInput,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  TableSkeleton, EmptyState, Pagination,
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

function InvoiceRow({
  invoice,
  onView,
}: {
  invoice: SalesInvoiceWithDetails;
  onView: (id: string) => void;
}) {
  const statusInfo = STATUS_BADGE[invoice.status];
  return (
    <TableRow className="cursor-pointer" onClick={() => onView(invoice.id)}>
      <TableCell className="font-mono text-sm font-medium">{invoice.invoiceNumber}</TableCell>
      <TableCell>{invoice.customerName}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{invoice.invoiceDate}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{invoice.dueDate}</TableCell>
      <TableCell numeric className="font-mono text-sm">{formatINR(invoice.totalAmount)}</TableCell>
      <TableCell numeric className="font-mono text-sm">{formatINR(invoice.amountReceived)}</TableCell>
      <TableCell numeric className="font-mono text-sm">{formatINR(invoice.balanceDue)}</TableCell>
      <TableCell>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

export function InvoiceListPage() {
  const navigate = useNavigate();
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data ?? [];
  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const { data, isLoading } = useInvoices({
    customerId: customerFilter || undefined,
    status: statusFilter as SalesInvoiceStatus | undefined || undefined,
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
          <Button onClick={() => navigate({ to: '/ar/invoices/new' })}>
            <Plus size={16} />
            New Invoice
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select
            options={customerOptions}
            value={customerFilter}
            onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-44">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <DateInput
            placeholder="From date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <DateInput
            placeholder="To date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Invoice #</Th>
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
            <TableSkeleton rows={6} cols={8} />
          ) : invoices.length === 0 ? (
            <tr>
              <td colSpan={8}>
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
              <InvoiceRow key={inv.id} invoice={inv} onView={handleView} />
            ))
          )}
        </TableBody>
      </Table>

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
