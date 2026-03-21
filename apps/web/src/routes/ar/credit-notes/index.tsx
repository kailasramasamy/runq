import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileMinus, Plus } from 'lucide-react';
import { useCreditNotes } from '../../../hooks/queries/use-credit-notes';
import { useCustomers } from '../../../hooks/queries/use-customers';
import type { CreditNote, CreditNoteStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Card,
  CardContent,
  Select,
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

const STATUS_VARIANT: Record<CreditNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
  draft: 'default',
  issued: 'info',
  adjusted: 'success',
  cancelled: 'outline',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'cancelled', label: 'Cancelled' },
];

function CreditNoteRow({ cn }: { cn: CreditNote }) {
  const isCancelled = cn.status === 'cancelled';
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ar/credit-notes/$creditNoteId"
          params={{ creditNoteId: cn.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {cn.creditNoteNumber}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {cn.customerId.slice(0, 8)}…
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {cn.invoiceId ? cn.invoiceId.slice(0, 8) + '…' : '—'}
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{cn.issueDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(cn.amount)}</TableCell>
      <TableCell
        className={`max-w-[200px] truncate text-zinc-500 dark:text-zinc-400 ${isCancelled ? 'line-through' : ''}`}
        title={cn.reason}
      >
        {cn.reason.length > 50 ? cn.reason.slice(0, 50) + '…' : cn.reason}
      </TableCell>
      <TableCell>
        <Badge
          variant={STATUS_VARIANT[cn.status]}
          className={`capitalize ${isCancelled ? 'line-through' : ''}`}
        >
          {cn.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function CreditNoteListPage() {
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const { data, isLoading } = useCreditNotes({
    customerId: customerId || undefined,
    status: (status || undefined) as CreditNoteStatus | undefined,
  });

  const customers = customersData?.data ?? [];
  const creditNotes = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Credit Notes' }]}
        actions={
          <Link to="/ar/credit-notes/new">
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700">
              <Plus size={16} />
              New Credit Note
            </button>
          </Link>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-52">
            <Select
              label="Customer"
              options={customerOptions}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <tr>
            <Th>CN #</Th>
            <Th>Customer</Th>
            <Th>Invoice</Th>
            <Th>Date</Th>
            <Th align="right">Amount</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : creditNotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={FileMinus}
                  title="No credit notes found"
                  description="Issue a credit note to adjust a customer's invoice or account balance."
                />
              </td>
            </tr>
          ) : (
            creditNotes.map((cn) => <CreditNoteRow key={cn.id} cn={cn} />)
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
