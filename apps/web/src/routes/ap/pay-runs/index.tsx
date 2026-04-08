import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { usePaymentRuns } from '../../../hooks/queries/use-payment-runs';
import type { PaymentRun, PaymentRunStatus } from '@runq/types';
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

const STATUS_VARIANT: Record<PaymentRunStatus, BadgeVariant> = {
  pending_approval: 'warning',
  partially_approved: 'cyan',
  approved: 'success',
  rejected: 'danger',
  executed: 'info',
};

const STATUS_LABEL: Record<PaymentRunStatus, string> = {
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

function RunRow({ run }: { run: PaymentRun }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ap/pay-runs/$runId"
          params={{ runId: run.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {run.runId}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{run.source}</TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-500">{run.description ?? '—'}</TableCell>
      <TableCell align="right" numeric>{run.totalCount}</TableCell>
      <TableCell align="right" numeric>{formatINR(run.totalAmount)}</TableCell>
      <TableCell align="right" numeric>
        {run.approvedCount > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-400">{formatINR(run.approvedAmount)}</span>
        ) : '—'}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[run.status]}>
          {STATUS_LABEL[run.status]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
        {new Date(run.createdAt).toLocaleDateString('en-IN')}
      </TableCell>
      <TableCell>
        <Link
          to="/ap/pay-runs/$runId"
          params={{ runId: run.id }}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View
        </Link>
      </TableCell>
    </TableRow>
  );
}

export function PayRunsListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePaymentRuns({
    status: status as PaymentRunStatus || undefined,
    source: source || undefined,
  });

  const runs = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Pay Runs"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Pay Runs' }]}
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
              placeholder="e.g. bills, vrindavan-dairy-ops"
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
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pay runs found"
            description="Pay runs are batches of bills (or external payment instructions) waiting for finance approval and execution."
          />
        ) : (
          runs.map((r) => (
            <div
              key={r.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => navigate({ to: '/ap/pay-runs/$runId', params: { runId: r.id } })}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.source}</span>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </div>
              <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{r.runId}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{r.totalCount} item{r.totalCount !== 1 ? 's' : ''}</span>
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 ml-auto">{formatINR(r.totalAmount)}</span>
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
            <Th>Run ID</Th>
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
          ) : runs.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={Inbox}
                  title="No pay runs found"
                  description="Pay runs are batches of bills (or external payment instructions) waiting for finance approval and execution."
                />
              </td>
            </tr>
          ) : (
            runs.map((r) => <RunRow key={r.id} run={r} />)
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
