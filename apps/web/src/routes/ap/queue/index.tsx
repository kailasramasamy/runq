import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
  const navigate = useNavigate();
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
        <CardContent className="grid grid-cols-2 gap-3 py-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="sm:w-52">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
          </div>
          <div className="sm:w-52">
            <Input
              label="Source"
              placeholder="e.g. vrindavan-dairy-ops"
              value={source}
              onChange={(e) => { setSource(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : batches.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No payment batches found"
            description="External systems will submit payment batches here for Finance approval."
          />
        ) : (
          batches.map((b) => (
            <div
              key={b.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => navigate({ to: '/ap/queue/$batchId', params: { batchId: b.id } })}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{b.source}</span>
                <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
              </div>
              <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{b.batchId}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{b.totalCount} item{b.totalCount !== 1 ? 's' : ''}</span>
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 ml-auto">{formatINR(b.totalAmount)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
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
      </div>

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
