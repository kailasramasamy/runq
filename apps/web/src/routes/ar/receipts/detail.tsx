import { ArrowDownToLine } from 'lucide-react';
import { useReceipt } from '../../../hooks/queries/use-receipts';
import type { ReceiptAllocationDetail } from '../../../hooks/queries/use-receipts';
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
} from '@/components/ui';

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'info' | 'outline'> = {
  sent: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'outline',
};

function AllocationRow({ alloc }: { alloc: ReceiptAllocationDetail }) {
  const variant = STATUS_VARIANT[alloc.invoiceStatus] ?? 'outline';
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{alloc.invoiceNumber}</TableCell>
      <TableCell align="right" numeric className="font-medium">{formatINR(alloc.amount)}</TableCell>
      <TableCell align="right" numeric>{formatINR(alloc.invoiceTotal)}</TableCell>
      <TableCell align="right" numeric>{formatINR(alloc.invoiceBalanceDue)}</TableCell>
      <TableCell>
        <Badge variant={variant} className="capitalize">
          {alloc.invoiceStatus.replace(/_/g, ' ')}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

interface Props { receiptId: string }

export function ReceiptDetailPage({ receiptId }: Props) {
  const { data, isLoading, isError } = useReceipt(receiptId);
  const receipt = data?.data;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !receipt) {
    return <p className="text-sm text-red-500">Receipt not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Receipt ${receipt.id.slice(0, 8)}…`}
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Receipts', href: '/ar/receipts' },
          { label: receipt.id.slice(0, 8) + '…' },
        ]}
      />

      {/* Amount hero */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ArrowDownToLine size={22} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Amount Received</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatINR(receipt.amount)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center py-5">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Method</p>
            <p className="mt-0.5 text-sm capitalize text-zinc-900 dark:text-zinc-100">
              {receipt.paymentMethod.replace(/_/g, ' ')}
            </p>
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Date</p>
            <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{receipt.receiptDate}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {/* Info card */}
        <Card>
          <CardHeader title="Receipt Information" />
          <CardContent>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <DetailRow label="Customer" value={receipt.customerName} />
              <DetailRow label="Receipt Date" value={receipt.receiptDate} />
              <DetailRow label="Method" value={receipt.paymentMethod.replace(/_/g, ' ')} />
              <DetailRow label="Reference Number" value={receipt.referenceNumber} />
              <DetailRow label="Bank Account" value={receipt.bankAccountId} />
              {receipt.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <DetailRow label="Notes" value={receipt.notes} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Allocations */}
        {receipt.allocations.length > 0 && (
          <Card>
            <CardHeader title="Invoice Allocations" />
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Invoice #</Th>
                    <Th align="right">Allocated</Th>
                    <Th align="right">Invoice Total</Th>
                    <Th align="right">Invoice Balance</Th>
                    <Th>Status</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {receipt.allocations.map((alloc) => (
                    <AllocationRow key={alloc.id} alloc={alloc} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
