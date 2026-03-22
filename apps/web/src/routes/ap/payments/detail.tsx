import { useState } from 'react';
import { Banknote, CheckCircle, XCircle } from 'lucide-react';
import { useVendorPayment, useApprovePayment, useRejectPayment } from '../../../hooks/queries/use-payments';
import type { VendorPaymentWithAllocations, PaymentStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Skeleton,
  ConfirmationDialog,
} from '@/components/ui';

const STATUS_VARIANT: Record<PaymentStatus, 'warning' | 'success' | 'danger' | 'outline'> = {
  pending: 'warning',
  completed: 'success',
  failed: 'danger',
  reversed: 'outline',
};

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

function PaymentInfoCard({ payment }: { payment: VendorPaymentWithAllocations }) {
  return (
    <Card>
      <CardHeader title="Payment Information" />
      <CardContent>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <DetailRow label="Vendor" value={payment.vendorName} />
          <DetailRow label="Payment Date" value={payment.paymentDate} />
          <DetailRow label="Method" value={payment.paymentMethod.replace(/_/g, ' ')} />
          <DetailRow label="UTR / Reference" value={payment.utrNumber} />
          <DetailRow label="Bank Account" value={payment.bankAccountId} />
          {payment.approvedBy && (
            <DetailRow label="Approved By" value={payment.approvedBy} />
          )}
          {payment.approvedAt && (
            <DetailRow label="Approved At" value={new Date(payment.approvedAt).toLocaleString()} />
          )}
          {payment.notes && (
            <div className="col-span-2 sm:col-span-3">
              <DetailRow label="Notes" value={payment.notes} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AllocationsCard({ payment }: { payment: VendorPaymentWithAllocations }) {
  if (payment.allocations.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Invoice Allocations" />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <tr>
              <Th>Invoice #</Th>
              <Th align="right">Allocated</Th>
              <Th align="right">Invoice Total</Th>
              <Th align="right">Balance After</Th>
              <Th>Invoice Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {payment.allocations.map((alloc) => (
              <TableRow key={alloc.id}>
                <TableCell className="font-mono text-xs">{alloc.invoiceNumber}</TableCell>
                <TableCell align="right" numeric className="font-medium">{formatINR(alloc.amount)}</TableCell>
                <TableCell align="right" numeric>{formatINR(alloc.invoiceTotal)}</TableCell>
                <TableCell align="right" numeric>{formatINR(alloc.invoiceBalanceDue)}</TableCell>
                <TableCell>
                  <Badge variant="default" className="capitalize">—</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface Props { paymentId: string }

export function PaymentDetailPage({ paymentId }: Props) {
  const { data, isLoading, isError } = useVendorPayment(paymentId);
  const payment = data?.data;
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const approveMutation = useApprovePayment();
  const rejectMutation = useRejectPayment();

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !payment) {
    return <p className="text-sm text-red-500">Payment not found.</p>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Payment ${payment.id.slice(0, 8)}…`}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: payment.id.slice(0, 8) + '…' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[payment.status]} className="capitalize text-sm px-3 py-1">
              {payment.status}
            </Badge>
            {payment.status === 'pending' && (
              <>
                <button
                  onClick={() => approveMutation.mutate(paymentId)}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle size={15} />
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <XCircle size={15} />
                  Reject
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Amount hero row */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
              <Banknote size={22} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Amount</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(payment.amount)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center py-5">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</p>
            <div className="mt-2">
              <Badge variant={STATUS_VARIANT[payment.status]} className="capitalize">
                {payment.status}
              </Badge>
            </div>
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Method</p>
            <p className="mt-0.5 text-sm capitalize text-zinc-900 dark:text-zinc-100">
              {payment.paymentMethod.replace(/_/g, ' ')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <PaymentInfoCard payment={payment} />
        <AllocationsCard payment={payment} />
      </div>

      <ConfirmationDialog
        open={showRejectDialog}
        title="Reject Payment"
        description="Are you sure you want to reject this payment? Any invoice allocations will be reversed."
        confirmLabel="Reject"
        variant="danger"
        loading={rejectMutation.isPending}
        onConfirm={() => {
          rejectMutation.mutate({ id: paymentId });
          setShowRejectDialog(false);
        }}
        onClose={() => setShowRejectDialog(false)}
      />
    </div>
  );
}
