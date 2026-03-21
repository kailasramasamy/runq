import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { usePaymentBatches } from '../../../hooks/queries/use-payment-queue';
import type { PaymentBatch, PaymentBatchStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Card,
  CardContent,
  Select,
  Input,
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

type BadgeVariant = 'warning' | 'success' | 'danger' | 'outline' | 'default' | 'cyan' | 'info';

const STATUS_VARIANT: Record<PaymentBatchStatus, BadgeVariant> = {
  pending_approval: 'warning',
  partially_approved: 'cyan',
  approved: 'success',
  rejected: 'danger',
  executed: 'info',
};

const STATUS_LABEL: Record<PaymentBatchStatus, string> = {
  pending_approval: 'Pending Approval',
  partially_approved: 'Partially Approved',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'partially_approved', label: 'Partially Approved' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executed', label: 'Executed' },
];

function BatchRow({ batch }: { batch: PaymentBatch }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ap/queue/$batchId"
          params={{ batchId: batch.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {batch.batchId}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{batch.source}</TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-500">{batch.description ?? '—'}</TableCell>
      <TableCell align="right" numeric>{batch.totalCount}</TableCell>
      <TableCell align="right" numeric>{formatINR(batch.totalAmount)}</TableCell>
      <TableCell align="right" numeric>
        {batch.approvedCount > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-400">{formatINR(batch.approvedAmount)}</span>
        ) : '—'}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[batch.status]}>
          {STATUS_LABEL[batch.status]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
        {new Date(batch.createdAt).toLocaleDateString('en-IN')}
      </TableCell>
      <TableCell>
        <Link
          to="/ap/queue/$batchId"
          params={{ batchId: batch.id }}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View
        </Link>
      </TableCell>
    </TableRow>
  );
}

export function PaymentQueuePage() {
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePaymentBatches({
    status: status as PaymentBatchStatus || undefined,
    source: source || undefined,
  });

  const batches = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Payment Queue"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Payment Queue' }]}
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-52">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-52">
            <Input
              label="Source"
              placeholder="e.g. vrindavan-dairy-ops"
              value={source}
              onChange={(e) => { setSource(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <tr>
            <Th>Batch ID</Th>
            <Th>Source</Th>
            <Th>Description</Th>
            <Th align="right">Count</Th>
            <Th align="right">Total Amount</Th>
            <Th align="right">Approved</Th>
            <Th>Status</Th>
            <Th>Date</Th>
            <Th>Actions</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={8} cols={9} />
          ) : batches.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={Inbox}
                  title="No payment batches found"
                  description="External systems will submit payment batches here for Finance approval."
                />
              </td>
            </tr>
          ) : (
            batches.map((b) => <BatchRow key={b.id} batch={b} />)
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
