import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, Plus, Download, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { useVendorPayments, useApprovePayment, useRejectPayment } from '@/hooks/queries/use-payments';
import { useVendors } from '@/hooks/queries/use-vendors';
import type { VendorPayment } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Select, StatTile, StatusBadge, PaymentMethodBadge, Avatar,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { ConfirmationDialog } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

const LIMIT = 25;

export function PaymentListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [vendorId, setVendorId] = useState('');
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const approveMutation = useApprovePayment();
  const rejectMutation = useRejectPayment();

  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data ?? [];

  const { data, isLoading } = useVendorPayments(
    { vendorId: vendorId || undefined },
    page,
  );

  const payments = (data?.data ?? []) as Array<VendorPayment & { vendorName?: string }>;
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const totalAmount = payments.reduce((a, p) => a + Number(p.amount), 0);
  const completedCount = payments.filter((p) => p.status === 'completed').length;
  const pendingCount = payments.filter((p) => p.status === 'pending').length;
  const failedCount = payments.filter((p) => p.status === 'failed').length;

  const vendorOptions = [
    { value: '', label: 'All vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Payments' }]}
        title="Payments"
        description="Vendor payments — RTGS / NEFT / cheque / UPI, advances and bulk runs."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => window.open(`/api/v1/ap/payments/export-csv`, '_blank')}
            >
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: '/finance/ap/payments/advance' })}>
              Advance
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: '/finance/ap/payments/direct' })}>
                  Direct
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: '/finance/ap/payments/bulk' })}>
                  Bulk
                </Button>
                <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ap/payments/new' })}>
                  New payment
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total paid (in view)"
          value={formatINRShort(totalAmount)}
          sub={`${payments.length} payment${payments.length === 1 ? '' : 's'}`}
          tone="pos"
        />
        <StatTile label="Completed" value={completedCount} sub="Cleared" tone="pos" />
        <StatTile label="Pending approval" value={pendingCount} sub="Awaiting review" tone={pendingCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Failed" value={failedCount} sub="Need attention" tone={failedCount > 0 ? 'neg' : 'neutral'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            options={vendorOptions}
            value={vendorId}
            onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} payments</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>Method</Th>
            <Th>UTR / Reference</Th>
            <Th align="right">Amount</Th>
            <Th>Status</Th>
            <Th align="right" />
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
          ) : payments.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<CreditCard size={18} />}
                  title="No payments found"
                  description="Record a new payment against vendor bills or log an advance payment."
                  action={(
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ap/payments/new' })}>
                      New payment
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : payments.map((p) => (
            <TableRow
              key={p.id}
              onClick={() => navigate({ to: '/finance/ap/payments/$paymentId', params: { paymentId: p.id } })}
            >
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(p.paymentDate)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar name={p.vendorName ?? '?'} size={24} />
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                    {p.vendorName ?? `${p.vendorId.slice(0, 8)}…`}
                  </span>
                </div>
              </TableCell>
              <TableCell><PaymentMethodBadge method={p.paymentMethod} /></TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>
                {p.utrNumber ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(Number(p.amount))}</TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {p.status === 'pending' && (
                    <>
                      <button
                        onClick={() => approveMutation.mutate(p.id)}
                        className="rounded p-1 hover:bg-[var(--pos-soft)]"
                        style={{ color: 'var(--pos)' }}
                        title="Approve"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        onClick={() => setRejectingId(p.id)}
                        className="rounded p-1 hover:bg-[var(--neg-soft)]"
                        style={{ color: 'var(--neg)' }}
                        title="Reject"
                      >
                        <XCircle size={14} />
                      </button>
                    </>
                  )}
                  <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmationDialog
        open={!!rejectingId}
        title="Reject Payment"
        description="Are you sure you want to reject this payment? Any invoice allocations will be reversed."
        confirmLabel="Reject"
        variant="danger"
        onConfirm={() => {
          if (rejectingId) rejectMutation.mutate({ id: rejectingId });
          setRejectingId(null);
        }}
        onClose={() => setRejectingId(null)}
      />

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
