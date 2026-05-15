import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  Banknote, CheckCircle, XCircle, RotateCcw, ArrowLeft,
  CreditCard, FileText, History, Hash, User as UserIcon,
} from 'lucide-react';
import { useVendorPayment, useApprovePayment, useRejectPayment, useReversePayment } from '@/hooks/queries/use-payments';
import { ApprovalPanel } from '@/components/approval-panel';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, StatTile, StatusBadge, PaymentMethodBadge, Avatar,
  DetailCard, DetailRow,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  formatDate,
} from '@/components/ar/primitives';
import { ConfirmationDialog } from '@/components/ui';

interface Props { paymentId: string }

export function PaymentDetailPage({ paymentId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data, isLoading, isError } = useVendorPayment(paymentId);
  const payment = data?.data;
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const approveMutation = useApprovePayment();
  const rejectMutation = useRejectPayment();
  const reverseMutation = useReversePayment();

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/ap/payments' });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }

  if (isError || !payment) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Payment not found.</p>;
  }

  const allocCount = payment.allocations.length;
  const allocTotal = payment.allocations.reduce((a, x) => a + Number(x.amount), 0);
  const unallocated = Number(payment.amount) - allocTotal;

  return (
    <div>
      <PageHeader
        title={`Payment ${payment.id.slice(0, 8)}…`}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: payment.id.slice(0, 8) + '…' },
        ]}
        titleBadge={<StatusBadge status={payment.status} />}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            {payment.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  icon={<CheckCircle size={13} />}
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(paymentId)}
                >
                  Approve
                </Button>
                <Button variant="outline" size="sm" icon={<XCircle size={13} />} onClick={() => setShowRejectDialog(true)}>
                  Reject
                </Button>
              </>
            )}
            {payment.status === 'completed' && (
              <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => setShowReverseDialog(true)}>
                Reverse
              </Button>
            )}
          </>
        }
      />

      {payment.status === 'pending' && (
        <div className="mb-5">
          <ApprovalPanel entityType="payment" entityId={paymentId} amount={payment.amount} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: amount hero + info + allocations */}
        <div className="space-y-4 lg:col-span-2">
          {/* Amount hero */}
          <div
            className="relative overflow-hidden rounded-xl border p-5"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-50"
              style={{ background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)' }}
            />
            <div className="relative flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                <Banknote size={22} />
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  Payment amount
                </div>
                <div className="num mt-1 text-[32px] font-semibold leading-none tabular-nums" style={{ color: 'var(--text-1)' }}>
                  {formatINR(Number(payment.amount))}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
                  <PaymentMethodBadge method={payment.paymentMethod} />
                  {payment.utrNumber && (
                    <>
                      <span>·</span>
                      <span className="num">{payment.utrNumber}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          <DetailCard title="Payment information" icon={<UserIcon size={14} />}>
            <DetailRow label="Vendor" value={payment.vendorName} />
            <DetailRow label="Payment date" value={formatDate(payment.paymentDate)} mono />
            <DetailRow label="Method" value={payment.paymentMethod.replace(/_/g, ' ')} />
            <DetailRow label="UTR / Reference" value={payment.utrNumber} mono />
            <DetailRow label="Bank account" value={payment.bankAccountId} mono />
            {payment.approvedBy && <DetailRow label="Approved by" value={payment.approvedBy} />}
            {payment.approvedAt && (
              <DetailRow label="Approved at" value={new Date(payment.approvedAt).toLocaleString()} />
            )}
          </DetailCard>

          {payment.notes && (
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Notes
              </div>
              <div className="text-[12.5px]" style={{ color: 'var(--text-1)' }}>{payment.notes}</div>
            </div>
          )}

          {/* Allocations */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
              <FileText size={14} style={{ color: 'var(--text-2)' }} />
              <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Bill allocations</h3>
              <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({allocCount})</span>
            </div>
            {allocCount === 0 ? (
              <div className="px-5 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
                Unallocated payment — no bills linked yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Bill #</Th>
                    <Th align="right">Allocated</Th>
                    <Th align="right">Bill total</Th>
                    <Th align="right">Balance after</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {payment.allocations.map((alloc) => (
                    <TableRow key={alloc.id}>
                      <TableCell>
                        <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                          {alloc.invoiceNumber}
                        </span>
                      </TableCell>
                      <TableCell align="right" numeric className="font-semibold">{formatINR(Number(alloc.amount))}</TableCell>
                      <TableCell align="right" numeric>{formatINR(Number(alloc.invoiceTotal))}</TableCell>
                      <TableCell align="right" numeric>{formatINR(Number(alloc.invoiceBalanceDue))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar name={payment.vendorName ?? '?'} size={32} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {payment.vendorName ?? `${payment.vendorId.slice(0, 8)}…`}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Vendor</div>
              </div>
            </div>
            <button
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11.5px] font-medium hover:bg-[var(--surface-2)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              onClick={() => navigate({ to: '/finance/ap/vendors/$vendorId', params: { vendorId: payment.vendorId } })}
            >
              View vendor
            </button>
          </div>

          <StatTile label="Allocated" value={formatINRShort(allocTotal)} sub={`${allocCount} bill${allocCount === 1 ? '' : 's'}`} />
          {unallocated > 0 && (
            <StatTile label="Unallocated" value={formatINRShort(unallocated)} sub="Open advance" tone="warn" />
          )}

          {payment.utrNumber && (
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Hash size={14} style={{ color: 'var(--text-2)' }} />
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>Reference</div>
              </div>
              <div className="num text-[12.5px]" style={{ color: 'var(--text-1)' }}>{payment.utrNumber}</div>
            </div>
          )}

          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <History size={14} style={{ color: 'var(--text-2)' }} />
              <div className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>Status</div>
            </div>
            <div className="space-y-1.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
              <div className="flex items-center gap-2">
                <CreditCard size={11} style={{ color: 'var(--text-3)' }} />
                Recorded {formatDate(payment.paymentDate)}
              </div>
              {payment.approvedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={11} style={{ color: 'var(--pos)' }} />
                  Approved {new Date(payment.approvedAt).toLocaleDateString('en-IN')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={showRejectDialog}
        title="Reject Payment"
        description="Are you sure you want to reject this payment? Any bill allocations will be reversed."
        confirmLabel="Reject"
        variant="danger"
        loading={rejectMutation.isPending}
        onConfirm={() => {
          rejectMutation.mutate({ id: paymentId });
          setShowRejectDialog(false);
        }}
        onClose={() => setShowRejectDialog(false)}
      />

      <ConfirmationDialog
        open={showReverseDialog}
        title="Reverse Payment"
        description="This will reverse the payment, restore bill balances, and reverse the GL journal entry. This cannot be undone."
        confirmLabel="Reverse"
        variant="danger"
        loading={reverseMutation.isPending}
        onConfirm={() => {
          reverseMutation.mutate({ id: paymentId, reason: 'Manual reversal' });
          setShowReverseDialog(false);
        }}
        onClose={() => setShowReverseDialog(false)}
      />
    </div>
  );
}
