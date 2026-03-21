import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FileText } from 'lucide-react';
import { usePurchaseInvoices, useDeletePurchaseInvoice } from '../../../hooks/queries/use-purchase-invoices';
import { useVendors } from '../../../hooks/queries/use-vendors';
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
} from '@/components/ui';

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

const LIMIT = 20;

export function BillListPage() {
  const navigate = useNavigate();
  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const filters = {
    vendorId: vendorId || undefined,
    status: (status || undefined) as PurchaseInvoiceStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, isLoading } = usePurchaseInvoices(filters);
  const { data: vendorsData } = useVendors({ limit: 100 });
  const deleteMutation = useDeletePurchaseInvoice();

  const bills = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const vendors = vendorsData?.data ?? [];
  const hasFilters = !!(vendorId || status || dateFrom || dateTo);

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate({ to: '/ap/bills/new' })}
          >
            <Plus size={14} />
            New Bill
          </Button>
        }
      />

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

      <Table>
        <TableHeader>
          <tr>
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
            <TableSkeleton rows={6} cols={10} />
          ) : bills.length === 0 ? (
            <tr>
              <td colSpan={10}>
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
