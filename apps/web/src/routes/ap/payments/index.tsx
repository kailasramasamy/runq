import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CreditCard, Plus, Download } from 'lucide-react';
import { useVendorPayments } from '../../../hooks/queries/use-payments';
import { useVendors } from '../../../hooks/queries/use-vendors';
import type { VendorPayment, PaymentStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
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
} from '@/components/ui';

const STATUS_VARIANT: Record<PaymentStatus, 'warning' | 'success' | 'danger' | 'outline'> = {
  pending: 'warning',
  completed: 'success',
  failed: 'danger',
  reversed: 'outline',
};

function PaymentRow({ payment }: { payment: VendorPayment & { vendorName?: string } }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ap/payments/$paymentId"
          params={{ paymentId: payment.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {payment.id.slice(0, 8)}…
        </Link>
      </TableCell>
      <TableCell className="text-sm">{payment.vendorName ?? payment.vendorId.slice(0, 8)}</TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{payment.paymentDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(payment.amount)}</TableCell>
      <TableCell className="capitalize text-zinc-600 dark:text-zinc-400">
        {payment.paymentMethod.replace('_', ' ')}
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {payment.utrNumber ?? '—'}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[payment.status]} className="capitalize">
          {payment.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function PaymentListPage() {
  const [vendorId, setVendorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data ?? [];

  const { data, isLoading } = useVendorPayments({
    vendorId: vendorId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const payments = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  function getExportUrl() {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return `/api/v1/ap/payments/export-csv?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Payments' }]}
        actions={
          <>
            <button
              onClick={() => window.open(getExportUrl(), '_blank')}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <Download size={16} />
              Export CSV
            </button>
            <Link to="/ap/payments/advance">
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
                Advance Payment
              </button>
            </Link>
            <Link to="/ap/payments/direct">
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
                Direct Payment
              </button>
            </Link>
            <Link to="/ap/payments/bulk">
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
                Bulk Payment
              </button>
            </Link>
            <Link to="/ap/payments/new">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700">
                <Plus size={16} />
                New Payment
              </button>
            </Link>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-52">
            <Select
              label="Vendor"
              options={vendorOptions}
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <DateInput
              label="From"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <DateInput
              label="To"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <tr>
            <Th>Payment ID</Th>
            <Th>Vendor</Th>
            <Th>Date</Th>
            <Th align="right">Amount</Th>
            <Th>Method</Th>
            <Th>UTR / Reference</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : payments.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={CreditCard}
                  title="No payments found"
                  description="Record a new payment against vendor invoices or log an advance payment."
                />
              </td>
            </tr>
          ) : (
            payments.map((p) => <PaymentRow key={p.id} payment={p} />)
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={20}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
